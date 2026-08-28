# User Noted TODO

These are random issues or shortcomings users have noted. They may or may not be mentioned in plans or fully planned out. Some are just too small to put into stories and could be wiped out in minutes, others take significant time. 


## Other
- [ ] Save unsaved tabs on reload. Currently unsaved tab content is lost on reload.
- [ ] Command palette fuzzy search and separate file search from command search. If you put `>` at the start of the search it searches commands. Take it away and it searches files. Optimize for tens of thousands of files. Use an ignore list of common issues, like `node_modules`.
- [ ] Mobile has no layout for tabs
- [ ] Activity bar icons slide off screen on small screens. Maybe tabs have a hard minimum width? Past a certain size, they should get moved to a kebab menu one by one, and never accidentally slides off screen.
- [ ] Command palette should be next to hamburger menu for action bar on mobile. 
- [ ] Add a plus button and other buttons to add folder or file in the File Viewer popout. Works on desktop and mobile to add a file. Creates next to the currently open file or falls back to root. 
- [ ] Highlight currently open file in file explorer. 


## Mobile UI
- [ ] New note button on mobile bottom bar needs a proper creation flow for mobile. 


# Journal
- [ ] Add direct link to metadata settings to add metadata
- [ ] Journal popout takes longer to open depending on number of files in the workspace. Instant on empty workspace, slow on big one. Same amount of time even if you already opened it once. Explorer is slow on first open but faster after that.

# Test suite
- [ ] A Rust test fails roughly once in fifteen `pnpm test:rust` runs and we do not know which one. Seen once on 2026-08-28 on the `code-compaction` branch; 13 consecutive runs after it were clean, including 8 run back to back hunting it. The failing run's output was discarded before the test name was read, so the first job is catching it: when `pnpm qa` fails, capture the whole output, not the tail. Likeliest suspects are the timing-dependent ones — `tests::watcher_lifecycle::*` and `commands::sync::registry::tests::the_sweeper_records_a_settled_change`. Until it is identified, every "qa green" carries a small chance of being luck.
