# User Noted TODO

These are random issues or shortcomings users have noted. They may or may not be mentioned in plans or fully planned out. Some are just too small to put into stories and could be wiped out in minutes, others take significant time. 

## Editor
- [ ] Only markdown files can be edited. Any filetype that can reasonably be edited or viewed should be able to be. If a file can't be edited, clicking it should open something in the canvas with an option to open in the system's default app. 
  - Types of files: text-based (code, markdown, txt, etc.), images, videos, audio, pdf (if easy), etc.

## Workspace Viewer
- [ ] File icons should represent the current file and be themed. They exist to a degree but should include everything from mp3 to markdown to docx. Should be adaptable to different themes.
- [ ] Themes should be able to use custom icon set per filetype and either fall back to app defaults or their own fallback.

## Other
- [ ] Save unsaved tabs on reload. Currently unsaved tab content is lost on reload.
- [ ] Command palette fuzzy search and separate file search from command search. If you put `>` at the start of the search it searches commands. Take it away and it searches files. Optimize for tens of thousands of files. Use an ignore list of common issues, like `node_modules`.
- [ ] Action menu items are spaced right, but their button hitboxes aren't square, they're skinny and tall. 
- [ ] Ctrl+tab to switch tabs, Ctrl+Shift+tab to switch tabs in reverse.
- [ ] Mobile has no layout for tabs
- [ ] Activity bar icons are super generic and need updating. Same for activity menu items. 


## Settings
- [ ] Settings should be single-page scrollable, and the nav should scroll to sections and highlight the current section (without causing glitchy scrolling that jumps up and down), and when the canvas gets below a certain size the settings nav should collapse to a hamburger menu. Right now it's all separate pages per subsection. It should be optimized for thousands of settings, just in case of expansion.
- [ ] Search should search all settings content, not just section titles.




# Journal
- [ ] Add direct link to metadata settings to add metadata
- [ ] Journal popout takes longer to open depending on number of files in the workspace. Instant on empty workspace, slow on big one. Same amount of time even if you already opened it once. Explorer is slow on first open but faster after that. 


# Other 
- [~] Occasionally during rebuilds, all saved settings are lost. Workspace, theme, tabs, everything. Stability issue? At the least we should be able to recover from corrupt state. Many paths of corruption fixes, backups, etc without memory leaks or flooding data or the drive. 
  - Two causes fixed in `plans/data-safety/pending-settings_survive_a_downgrade-med-med.md`: a document from a newer build was discarded rather than read (a branch switch does this), and an unparseable one was overwritten rather than set aside. Still open there: telling the user in-app, and what corrupts a document in the first place.
