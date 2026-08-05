# User Noted TODO

These are random issues or shortcomings users have noted. They may or may not be mentioned in plans or fully planned out. Some are just too small to put into stories and could be wiped out in minutes, others take significant time. 


## Editor
- [ ] Only markdown files can be edited. Any filetype that can reasonably be edited or viewed should be able to be. If a file can't be edited, clicking it should open something in the canvas with an optino to open in the system's default app. 
- [ ] Markdown preview style editor is not implemented. Goal is obsidian-style, where you can see the markdown rendered, but when the cursor is on the same line all markdown symbols are shown, and when it leaves the line markdown symbols are hidden. You make edits by adding markdown symbols, or if you press ctrl+i for example the system puts symbols to make it italic. 


## Extensions
- [ ] Not sure if extensions are planned out. Extensions should allow for custom functionality and features.
   - [ ] Example: A journal and journaling calendar. Activity bar has two new buttons, one for the journal and one for the calendar. The journal button opens a left popout with a list of journal entries, and the calendar button opens a left popout with a calendar view, options to show days with journal entries, mood by day, activity by day, etc. Journal entries are stored in a configurable folder in the workspace with configurable markdown names for each entry, optionally stored in folders by week, month, and/or year. Default month and year. Mobile friendly design.

## Themes
- [ ] Themes should be modular and stored in a single file. Importing and exporting themes involves only that one file. It should be easy to improve the UI and have themes automatically applied, using system colors rather than hard rgb values for example. Account for anything I might be missing here. 
- [x] Current dark theme leaves the editor cursor dark and impossible to see. _Fixed: EditorView.theme with { dark: true } + caret-color on .cm-content + borderLeftColor on .cm-cursor._ 