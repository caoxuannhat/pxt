namespace pxt.tutorial {
    export function parseTutorial(tutorialmd: string): TutorialInfo {
        const steps = parseTutorialSteps(tutorialmd);
        const title = parseTutorialTitle(tutorialmd);
        if (!steps)
            return undefined; // error parsing steps

        // collect code and infer editor
        let editor: string = undefined;
        const regex = /```(sim|block|blocks|filterblocks|spy|ghost|typescript|ts|js|javascript|template)?\s*\n([\s\S]*?)\n```/gmi;
        let code = '';
        let templateCode: string;
        // Concatenate all blocks in separate code blocks and decompile so we can detect what blocks are used (for the toolbox)
        tutorialmd
            .replace(/((?!.)\s)+/g, "\n")
            .replace(regex, function (m0, m1, m2) {
                switch (m1) {
                    case "block":
                    case "blocks":
                    case "filterblocks":
                        if (!checkTutorialEditor(pxt.BLOCKS_PROJECT_NAME))
                            return undefined;
                        break;
                    case "spy":
                        if (!checkTutorialEditor(pxt.PYTHON_PROJECT_NAME))
                            return undefined;
                        break;
                    case "typescript":
                    case "ts":
                    case "javascript":
                    case "js":
                        if (!checkTutorialEditor(pxt.JAVASCRIPT_PROJECT_NAME))
                            return undefined;
                        break;
                    case "template":
                        templateCode = m2;
                        break;
                }
                code += "\n { \n " + m2 + "\n } \n";
                return "";
            });

        return <pxt.tutorial.TutorialInfo>{
            editor: editor || pxt.BLOCKS_PROJECT_NAME,
            title: title,
            steps: steps,
            code,
            templateCode
        };

        function checkTutorialEditor(expected: string) {
            if (editor && editor != expected) {
                pxt.debug(`tutorial ambiguous: contains snippets of different types`);
                return false;
            } else {
                editor = expected;
                return true;
            }
        }
    }

    function parseTutorialTitle(tutorialmd: string): string {
        let title = tutorialmd.match(/^#[^#](.*)$/mi);
        return title && title.length > 1 ? title[1] : null;
    }

    function parseTutorialSteps(tutorialmd: string): TutorialStepInfo[] {
        const hiddenSnippetRegex = /```(filterblocks|package|ghost|config|template)\s*\n([\s\S]*?)\n```/gmi;
        const hintTextRegex = /(^[\s\S]*?\S)\s*((```|\!\[[\s\S]+?\]\(\S+?\))[\s\S]*)/mi;

        // Download tutorial markdown
        let steps = tutorialmd.split(/^##[^#].*$/gmi);
        let newAuthoring = true;
        if (steps.length <= 1) {
            // try again, using old logic.
            steps = tutorialmd.split(/^###[^#].*$/gmi);
            newAuthoring = false;
        }
        if (steps[0].indexOf("# Not found") == 0) {
            pxt.debug(`tutorial not found`);
            return undefined;
        }
        let stepInfo: TutorialStepInfo[] = [];
        tutorialmd.replace(newAuthoring ? /^##[^#](.*)$/gmi : /^###[^#](.*)$/gmi, (f, s) => {
            let info: TutorialStepInfo = {
                fullscreen: /@(fullscreen|unplugged)/.test(s),
                unplugged: /@unplugged/.test(s),
                tutorialCompleted: /@tutorialCompleted/.test(s)
            }
            stepInfo.push(info);
            return ""
        });

        if (steps.length < 1)
            return undefined; // Promise.resolve();
        steps = steps.slice(1, steps.length); // Remove tutorial title

        for (let i = 0; i < steps.length; i++) {
            const stepContent = steps[i].trim();
            const contentLines = stepContent.split('\n');
            stepInfo[i].headerContentMd = contentLines[0];
            stepInfo[i].contentMd = stepContent;

            // everything after the first ``` section OR the first image is currently treated as a "hint"
            let hintText = stepContent.match(hintTextRegex);
            let blockSolution;
            if (hintText && hintText.length > 2) {
                stepInfo[i].headerContentMd = hintText[1];
                blockSolution = hintText[2];
                if (blockSolution) {
                    // remove hidden snippets from the hint
                    blockSolution = blockSolution.replace(hiddenSnippetRegex, '');
                    stepInfo[i].blockSolution = blockSolution;
                }
            }

            stepInfo[i].hasHint = blockSolution && blockSolution.length > 1;
        }
        return stepInfo;
    }

    export function highlight(pre: HTMLPreElement): void {
        let text = pre.textContent;
        if (!/@highlight/.test(text)) // shortcut, nothing to do
            return;

        // collapse image python/js literales
        text = text.replace(/img\s*\(\s*"{3}(.|\n)*"{3}\s*\)/g, `""" """`);
        text = text.replace(/img\s*\(\s*`(.|\n)*`\s*\)/g, "img` `");

        // render lines
        pre.textContent = ""; // clear up and rebuild
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; ++i) {
            let line = lines[i];
            if (/@highlight/.test(line)) {
                // highlight next line
                line = lines[++i];
                if (line !== undefined) {
                    const span = document.createElement("span");
                    span.className = "highlight-line";
                    span.textContent = line;
                    pre.appendChild(span);
                }
            } else {
                pre.appendChild(document.createTextNode(line + '\n'));
            }
        }
    }

    /**
     * This is a temporary hack to automatically patch examples and tutorials while
     * the pxt-arcade APIs are being updated. This should be removed once that upgrade is
     * complete.
     *
     * @param inputJS The snippet of js (or markdown with js snippets) to upgrade
     */
    export function patchArcadeSnippets(inputJS: string): string {
        if (pxt.appTarget.id !== "arcade" && pxt.appTarget.id !== "pxt-32") return inputJS;

        const declRegex = /enum\s+SpriteKind\s*{((?:[^}]|\s)+)}/gm;
        const builtin = ["Player", "Projectile", "Enemy", "Food"]
        const match = declRegex.exec(inputJS);

        if (match) {
            const referencedNames = match[1].split(/(?:\s|,)+/)
                .map(n => n.trim())
                .filter(n => /[a-zA-Z]+/.test(n))
                .filter(n => builtin.indexOf(n) === -1);

            if (referencedNames.length) {
                return inputJS.replace(declRegex,
`
namespace SpriteKind {
${referencedNames.map(rn => "    export const " + rn + " = SpriteKind.create()").join("\n")}
}
`)
            }
            else {
                return inputJS.replace(declRegex, "");
            }
        }

        return inputJS;
    }
}