# UI Design and Architecture

*Date: 6/16/2026, 8:42:28 PM*

  
    ## User

I'm designing a notes app like obsidian, cross platform. I want git sync, extensions, and no database in the main folder so that it doesn't break sync with services like Google drive, OneDrive, and sync thing. 

This is a prototype spec put together by an AI. I need help cleaning it up so it's a spec, not a command, and with designing the app interaction, UI, and then architecture. 

The UI design needs to be detailed. Ask questions as you work and provide suggestions (briefly) for each. If something doesnt make sense to you or is maybe not the best choice be straightforward. Better to catch it now than spend thousands of dollars fixing it later. 

 Here's my initial UI suggestion, then at the end you'll get the LLM prototype spec that we're working on. My design is more authoritative but too brief to work off of. 

# mine

---

```plaintext
# Desktop UI
Editor and note taker styled like obsidian and VS code, with the left nav Activity Bar that controls a left panel, a main content area, and a "mini activity bar" in the title bar to the left of the window controls with a compact display and a couple mini icons that select the content of a right panel. Left and right panel can be collapsed by selecting the currently selected button again. 

**Main sections**:
- **Title Bar**: 
	- File menu
	- Tabs
	- Mini activity bar: Same behavior as activity bar but controls right panel. 
	- Window controls
- **Activity bar**: Far left. Dynamic. Clicking an option opens it in the left panel and expands the panel. Clicking the currently open one hides the panel. Can contain:
	- File Explorer
	- Tag explorer
	- Any other menu options
- **Left panel**: Next left. 
- **Main content**: Middle. Can contain:
	- Editor
	- Calendar
	- Any other content 
- **Right panel**: far right. Collapsible. 
	- AI ACP tool. Utilizes codex, Claude code. 
- **Status bar**: Bottom. Sync status, any other status.
```

# The AI

---

```plaintext
# AI Master Prompt: Cross-Platform Markdown Journal
**Role & Objective**
You are an expert software architect and full-stack developer. Your task is to help me build a cross-platform Markdown Journal/Notes application. You will guide me step-by-step, providing production-ready code, architecture decisions, and configuration files based on the following master specification. Do not write the entire application at once. Acknowledge this prompt, summarize the architecture, and ask me which module we should begin building first.
## 1. High-Level Architecture
 * **Repository Strategy:** Monorepo (using Turborepo or Nx) to maximize code reuse.
 * **Shared Core (/packages/core):** TypeScript library handling file system abstractions, markdown parsing, tag extraction, and state logic.
 * **Desktop Client (/apps/desktop):** React for the UI, wrapped in Tauri (Rust) for Windows, Mac, and Linux. This ensures native performance, low RAM usage, and direct file-system access.
 * **Mobile Client (/apps/mobile):** React Native (via Expo) for Android and iOS.
 * **State Management:** Zustand for lightweight, cross-component state management.
## 2. Platform-Agnostic Adapters (Hub-and-Spoke)
Because Desktop and Mobile handle native APIs differently, the Shared Core defines strict interfaces (e.g., IFileSystem, IDatabase).
 * **Desktop (Tauri):** Implements these interfaces using @tauri-apps/plugin-fs and @tauri-apps/plugin-sql via Rust commands.
 * **Mobile (React Native):** Implements these interfaces using expo-file-system and expo-sqlite.
## 3. Data & Sync Strategy (Bring Your Own Sync)
 * **Local-First:** All user data is stored as raw .md files and attachments in a user-selected "Vault" directory (e.g., inside their local OneDrive or Dropbox folder). No proprietary database formats for user notes.
 * **Separation of Concerns:** App cache, settings, and SQLite indexes are stored entirely separately in the OS's hidden AppData/Config directories.
 * **Conflict Resolution:** * A File Watcher monitors the Vault.
   * If a cloud provider creates a duplicate file (e.g., Note-DESKTOP-XYZ.md), the app detects it via Regex.
   * The UI flags the conflict and presents a Diff/Merge modal (powered by a library using the diff-match-patch algorithm).
## 4. Local Knowledge Graph (SQLite Schema)
A local SQLite database provides instant search and relationship mapping without reading file contents on the fly.
 * **Files Table:** path (PK), title, last_modified, hash (for diff detection).
 * **Tags Table:** id, tag_name, file_path (FK).
 * **Links Table:** source_path, target_path (Powers [[WikiLinks]] and Backlinks).
## 5. Link Parsing & Editor Middleware
 * When the editor saves a file, a middleware function intercepts the raw markdown.
 * It runs Regex to extract #tags and [[WikiLinks]].
 * It updates the local SQLite database with the new relationships before the backend writes the file to the OS.
## 6. UI & State Specifications
 * **Editor Component:** Use uiwjs/react-md-editor with a toggle for WYSIWYG vs. raw markdown mode.
 * **Tab Store:** Zustand manages an array of open tabs [{ id, type: 'markdown' | 'image', filePath }].
 * **Drag & Drop:** Dropping an image/file into the editor automatically copies it to an /attachments folder and inserts the relative markdown link.
```

Be extremely detailed and don't commit to a document until you've got the first part down. I'm ready to be detailed in this step.

---

    ## Assistant

Good. This is exactly the stage where you want to be ruthless. Most note apps accumulate architectural debt because they start with "Obsidian clone" as a goal instead of defining:

1. What the user actually owns.
2. What the application owns.
3. What can be extended.
4. What can never break.

Before we write a specification, I would actually reject several parts of the AI draft as-is.

---

# First: What I think is correct

These are strong decisions.

### 1. Local-first vault

This is non-negotiable.

The vault should contain only:

```text
Vault/
├── Notes/
├── Attachments/
├── Templates/
└── ...
```

No database.

No cache.

No lock files.

No hidden metadata.

A user should be able to:

* Open vault in VS Code
* Open vault in Obsidian
* Open vault in a text editor
* Sync with:
  * Git
  * Syncthing
  * OneDrive
  * Dropbox
  * Google Drive
  * iCloud

without your app creating problems.

This is probably the most important design decision.

---

### 2. Separate application data

I strongly agree.

App data should live in:

Windows:

```text
AppData/Roaming/AppName
```

Mac:

```text
~/Library/Application Support/AppName
```

Linux:

```text
~/.config/AppName
```

Contains:

```text
settings.json
cache.db
search.db
plugins/
logs/
```

Never inside vault.

---

### 3. Tauri

For this type of application:

Tauri > Electron

Reasons:

* lower RAM
* native filesystem
* native git
* easier updater
* smaller installer

I'd keep Tauri.

---

# First concern: SQLite Knowledge Graph

I would NOT design this the way the AI suggested.

Current proposal:

```text
Save note
→ Parse markdown
→ Update database
→ Save file
```

Bad.

Why?

Because the database becomes authoritative.

Eventually:

```text
Markdown ≠ Database
```

and you'll spend years fixing sync bugs.

---

Instead:

```text
Markdown files
        ↓
Indexer
        ↓
Search Database
```

Database is always disposable.

Always rebuildable.

Think VS Code.

Think ripgrep.

Think language servers.

---

I would change architecture to:

```text
Vault
   ↓
File Watcher
   ↓
Indexer
   ↓
Search Database
```

Never:

```text
Editor
   ↓
Database
   ↓
Files
```

Files are source of truth.

---

# Second concern: WYSIWYG

I need to challenge this.

The AI spec says:

```text
Raw Markdown
+
WYSIWYG
```

This sounds nice.

It becomes a nightmare.

Questions:

Do you want:

### Option A

Obsidian style

```text
Markdown editor
with live preview
```

Example:

```md
# Heading
```

renders as heading.

This is what Obsidian does.

---

### Option B

True WYSIWYG

Like Notion.

No markdown visible.

---

I strongly recommend Option A.

Reason:

Every major markdown app that survives eventually drifts toward:

```text
Markdown-first
```

because WYSIWYG creates:

* formatting bugs
* sync bugs
* plugin bugs
* export bugs

---

# Third concern: Mobile

The draft jumps immediately to:

```text
Desktop
+
Mobile
```

I think that's dangerous.

Question:

### Is mobile required for V1?

My recommendation:

Phase 1:

```text
Desktop only
```

Windows

Mac

Linux

Phase 2:

```text
Mobile
```

Because mobile introduces:

* different filesystem APIs
* background sync
* attachment handling
* vault selection
* security sandboxing

which doubles architecture complexity.

---

# Now let's design the UI properly

Your UI idea is already much stronger than the AI's.

It feels like:

```text
VS Code
+
Obsidian
```

which is exactly where I'd start.

---

# Proposed Desktop Layout

```text
┌──────────────────────────────────────────────┐
│ Menu Tabs RightTools WindowControls          │
├─┬───────────────────────────────┬───────────┤
│A│                               │           │
│c│                               │           │
│t│ Left Panel                    │ Right     │
│i│                               │ Panel     │
│v│                               │           │
│ │                               │           │
├─┴───────────────────────────────┴───────────┤
│                Status Bar                   │
└─────────────────────────────────────────────┘
```

---

# Activity Bar

Very similar to VS Code.

Default icons:

```text
Files
Search
Tags
Graph
Calendar
Tasks
Extensions
Settings
```

Question:

Should extensions be allowed to add icons here?

My recommendation:

YES.

Exactly like VS Code.

---

# Left Panel

Context-sensitive.

Files selected:

```text
Vault Explorer
```

Tags selected:

```text
Tag Explorer
```

Graph selected:

```text
Graph Controls
```

Extensions selected:

```text
Extension Browser
```

---

# Main Content

Supports tabs.

Example:

```text
[Note1.md]
[Note2.md]
[Calendar]
[Graph]
```

Tabs can contain more than notes.

Important distinction.

I would define:

```typescript
type Tab =
  | NoteTab
  | SearchTab
  | CalendarTab
  | GraphTab
  | PluginTab
```

This will matter later.

---

# Right Panel

This is where I think your design gets interesting.

You proposed:

```text
Mini Activity Bar
```

I love this.

Because it avoids:

```text
AI panel permanently open
```

which wastes space.

Example:

```text
🧠 AI
🔗 Backlinks
📋 Outline
⭐ Properties
```

Clicking icon:

```text
open panel
```

Clicking again:

```text
close panel
```

Exactly like left side.

Very clean.

---

# AI Panel

Question:

Do you want AI tied to notes?

Example:

```text
Summarize current note
Explain selection
Generate tasks
```

Or do you want:

```text
General chat
```

My recommendation:

AI should be note-context aware first.

Not generic chat.

Otherwise it becomes another ChatGPT wrapper.

---

# Biggest Architecture Question

This is the question I would answer before writing a specification:

## Are extensions frontend-only or full-trust?

Option A:

```text
Javascript UI extensions
```

Safe.

Simple.

Like Obsidian.

---

Option B:

```text
Extensions can access filesystem
Git
Network
Commands
```

Like VS Code.

Far more powerful.

Far more dangerous.

---

My recommendation:

Start with:

```text
Frontend sandbox plugins
```

Then later add:

```text
Native capability permissions
```

similar to VS Code.

---

# Questions Before We Continue

These answers will radically affect the architecture:

### 1

What is the primary editor model?

* A. Obsidian-style markdown editor with live preview
* B. True WYSIWYG
* C. Both

(My recommendation: A)

---

### 2

Is mobile required for V1?

(My recommendation: No)

---

### 3

Should plugins be able to:

* add panels
* add activity bar icons
* add commands
* add settings pages

or also:

* access filesystem
* run shell commands
* perform git operations

(My recommendation: start with UI + commands only)

---

### 4

Do you want multiple vaults open simultaneously?

Example:

```text
Work Vault
Personal Vault
Research Vault
```

This affects the entire workspace model.

(My recommendation: Yes, but only one active workspace window initially.)

---

### 5

Git Sync:

Do you envision:

**A. Built-in Git UI** (like VS Code Source Control)

or

**B. Automatic background Git sync**

or

**C. Both**

(My recommendation: Both, but built-in Git UI should exist because automatic sync eventually encounters conflicts that need user intervention.)

Once we settle those five decisions, I'd move on to a full UI specification (screen-by-screen), then workspace model, plugin architecture, vault architecture, search/indexing architecture, and finally the technical implementation spec.

---

    ## User

Answers

# SQLite Knowledge Graph

Your architecture is much better. Let's use that. 

```plaintext
Vault
   ↓
File Watcher
   ↓
Indexer
   ↓
Search Database
```

# WYSIWYG

As you said, go with `Markdown editor

with live preview.`

`codemirror-live-markdown` is apparently specifically designed to be like obsidian's WYSIWYG editor, and uses the same base of CodeMirror 6. 

# Mobile

Desktop is the priority. However I want to make a mobile version early on, so let's discuss. How can we share code between mobile and desktop without trying to go completely cross platform? Or is it better to write a mobile app from scratch using the design documents and a new UI?

# UI

The activity bar is good and the right panel, status bar, etc and your descriptions are perfect. The ASCII UI mock-up just missed the center panel. 

## AI Panel

The panel should use ACP (agent context protocol) so Claude Code, Codex, and other CLI Agent tools can use their own harness to chat, read, edit, and use their own MCP tools based on the directory. 

# Extensions

I'm suspecting your suggestion of frontend first then backend later will be best. Let's go with UI + commands only first. 

# Multiple Vaults 

Yes, but only one active workspace window initially. One vault per window. 

# git sync

Both, but built-in Git UI should exist because automatic sync eventually encounters conflicts that need user intervention.

 The same UI should work for detected merge conflicts from OneDrive and other systems. Those conflict files can probably be detected by comparing file names and using custom regex. That keeps OneDrive sync completely out of our code - the user just sticks their vault in a OneDrive, syncthing, or similar folder.

---

    ## Assistant

Excellent. We're already making decisions that will prevent major rewrites later.

The biggest improvement so far is this:

```text
Files = Source of Truth

Vault
   ↓
File Watcher
   ↓
Indexer
   ↓
Search Database
```

That single decision eliminates an entire class of sync and corruption bugs.

---

# Mobile Architecture Discussion

This is actually one of the most important decisions we'll make.

The AI spec proposed:

```text
Shared Core
React Desktop
React Native Mobile
```

which is generally the right direction.

However, I would not think of it as:

```text
Cross Platform App
```

I would think of it as:

```text
Shared Engine
+
Separate Applications
```

Those are very different.

---

## What Should Be Shared?

### Share

```text
Markdown Parser
Indexer
Tag Parser
Wiki Link Parser
Search Logic
Vault Logic
Git Logic
Command System
Plugin API Contracts
Settings Schema
```

Essentially:

```text
/packages/core
```

---

### Do Not Share

```text
Desktop UI
Mobile UI
Desktop Navigation
Mobile Navigation
Desktop Panels
Mobile Panels
Desktop Layout
```

The mistake many teams make:

```text
Let's make one UI for everything
```

and then spend years fighting it.

---

Desktop should feel like:

```text
VS Code
+
Obsidian
```

---

Mobile should feel like:

```text
Apple Notes
+
Obsidian Mobile
```

Different UX.

Same vault format.

Same engine.

---

## My Recommendation

Architecture:

```text
/apps
    /desktop
    /mobile

/packages
    /core
    /markdown
    /indexer
    /search
    /git
    /commands
    /plugin-api
```

Then:

```text
Desktop = Tauri + React
Mobile = React Native
```

but both consume:

```text
packages/core
```

---

# One Thing I Would Add

The AI draft missed a Workspace layer.

I think this is critical.

Current:

```text
Vault
```

Proposed:

```text
Workspace
    └── Vault
```

---

Example:

```text
Workspace
├── Open Tabs
├── Panel Layout
├── Window State
├── Recent Files
├── Active Vault
└── Enabled Extensions
```

Stored outside vault.

---

This means:

Changing computers doesn't unexpectedly sync:

```text
tabs
window size
AI history
```

through OneDrive.

Users generally don't want that.

---

# ACP / Agent Context Protocol

I like this idea much more than embedding a custom AI.

But I want to challenge one piece.

You said:

```text
Claude Code
Codex
Other Agent Tools
```

Good.

The question is:

Should the note application directly implement ACP?

or

Should ACP be implemented as an extension?

---

My recommendation:

Not built into core.

Instead:

```text
AI Integration Layer
```

in the extension system.

Core app should know:

```typescript
interface ChatProvider {
    startSession()
    sendMessage()
    cancel()
}
```

Then:

```text
Claude Extension
Codex Extension
Gemini Extension
```

implement providers.

---

Reason:

AI tooling changes every 6 months.

Notes apps last 10 years.

Don't couple them.

---

# Git Sync Architecture

I strongly agree with:

```text
User Owns Sync
```

instead of:

```text
App Owns Sync
```

This is a major selling point.

---

I would explicitly state:

### Supported

```text
Git
OneDrive
Dropbox
Google Drive
iCloud
Syncthing
NAS
SMB Shares
```

because all are simply:

```text
Filesystem Sync
```

from the application's perspective.

---

# Conflict Detection

I would modify your proposal slightly.

You mentioned:

```text
Regex detection
```

This should be:

### Layer 1

Known provider patterns

Examples:

```text
Note (Adam's PC).md
Note-DESKTOP.md
Note-conflicted-copy.md
```

---

### Layer 2

Content hash detection

Because not every sync system follows predictable naming.

---

### Layer 3

Git merge conflicts

```text
<<<<<<< HEAD
=======
>>>>>>> branch
```

---

All three should open the same UI:

```text
Conflict Resolution View
```

---

# Let's Design the UI Properly

The next thing I want to define is navigation behavior.

Most note apps get this wrong.

---

## Question 1

What should happen when clicking a note?

Option A (VS Code)

```text
Single Click
    Preview Tab

Double Click
    Permanent Tab
```

---

Option B (Obsidian)

```text
Single Click
    Open Tab
```

---

Option C

Configurable

---

My recommendation:

VS Code behavior.

For large vaults it prevents:

```text
50 tabs open
```

after browsing.

---

## Question 2

Should tabs support split views?

Example:

```text
┌─────────┬─────────┐
│ Note A  │ Note B  │
└─────────┴─────────┘
```

or

```text
┌─────────┐
│ Note A  │
├─────────┤
│ Note B  │
└─────────┘
```

My recommendation:

Yes.

V1.

This becomes very important for backlinks, research, and AI-assisted editing.

---

## Question 3

Properties / Frontmatter

Should properties appear:

### A

Only as markdown

```yaml
---
tags:
  - project
---
```

---

### B

Visual property editor

like Obsidian

---

I recommend:

B.

Stored as markdown.

Edited visually.

Best of both worlds.

---

## Question 4

Command Palette

Do you want:

```text
Ctrl+Shift+P
```

as a first-class feature from day one?

I strongly recommend yes.

In fact:

Commands should be the backbone of extensibility.

Exactly like VS Code.

---

## Question 5 (Most Important UI Question Yet)

Should the Graph View be:

### Core Feature

Built into the application

or

### Official Extension

Shipped with the application

---

My recommendation:

Official extension.

The graph is visually impressive but shouldn't influence core architecture.

If we agree on that, the next step is defining:

1. Activity Bar items
2. Left panel behavior
3. Tab system
4. Split panes
5. Command system
6. Extension API surface

before writing any formal specification document.

---

    ## User

## question 1

Again, your suggestion is good:

```plaintext
Single Click
    Preview Tab

Double Click
    Permanent Tab
```

## Question 2

Yes, let's support split views in V1. 

## Question 3

Stored as markdown. Edited visually. Best of both worlds. 

## Question 4

Command Pallete is an absolute must! Good suggestion!

## Question 5

Graph view should be an extension, like you suggested. It will be a great test.

---

    ## Assistant

Perfect. I think we've now locked down enough foundational decisions to start designing the application itself instead of debating technologies.

What I like most is that the architecture is becoming very consistent:

```text
User Owns Data
User Owns Sync
Files Are Source Of Truth
Extensions Are First-Class
AI Is Just Another Tool
```

That's actually closer to VS Code's philosophy than Obsidian's, and I think that's a good thing.

---

# One Major Concern I Want To Raise Now

I think we should stop calling this:

```text
Notes App
```

internally.

Because everything we're designing is actually:

```text
Workspace Application
```

The distinction matters.

A notes app is:

```text
Open note
Edit note
Save note
```

What we're building is:

```text
Notes
Tasks
Graphs
AI
Git
Extensions
Multiple Panels
Commands
Workspaces
```

That's much closer to:

```text
VS Code for Markdown Knowledge Management
```

which will affect architecture decisions later.

---

# Proposed UI Model

Let's define the shell.

## Window Layout

```text
┌────────────────────────────────────────────────────────────┐
│ Menu | Tabs | Right Activity Bar | Window Controls         │
├─────┬───────────────────────────────┬──────────────────────┤
│     │                               │                      │
│ Act │                               │                      │
│ Bar │      Main Content Area        │    Right Panel       │
│     │                               │                      │
├─────┼───────────────────────────────┼──────────────────────┤
│     │ Left Panel                    │                      │
├─────┴───────────────────────────────┴──────────────────────┤
│ Status Bar                                                 │
└────────────────────────────────────────────────────────────┘
```

The important thing here:

The Main Content Area is the primary object.

Everything else exists to support it.

---

# Activity Bar (Left)

I would make this fully extensible from day one.

Built-in entries:

```text
Explorer
Search
Tags
Calendar
Tasks
Git
Extensions
Settings
```

Notice:

```text
Graph
```

is not here.

Because Graph is an extension.

If installed:

```text
Explorer
Search
Tags
Calendar
Tasks
Git
Graph
Extensions
Settings
```

appears automatically.

That becomes our proof that extensions are first-class citizens.

---

# Left Panel

The left panel should never have a fixed purpose.

Instead:

```typescript
interface ActivityView {
    id: string
    icon: string
    title: string
    component: ReactComponent
}
```

Selecting an activity loads its view.

Examples:

Explorer:

```text
Vault Tree
```

Search:

```text
Search Input
Results
Filters
```

Git:

```text
Changed Files
Commits
Branches
```

Extensions:

```text
Installed Extensions
Marketplace
```

---

# Right Activity Bar

This is where I think the app becomes unique.

Instead of:

```text
AI panel permanently visible
```

we have:

```text
Outline
Properties
Backlinks
AI
History
```

Each one behaves identically to the left side.

---

# Right Panel Views

Built-in candidates:

### Outline

Generated from headings.

```markdown
# Project

## Goals

### Architecture
```

renders:

```text
Project
  Goals
    Architecture
```

---

### Properties

Visual frontmatter editor.

Markdown:

```yaml
---
status: active
priority: high
---
```

Visual:

```text
Status    [active ▼]
Priority  [high ▼]
```

---

### Backlinks

Shows:

```text
Referenced By
```

using the indexer.

---

### History

Recent note history.

Useful for navigation.

---

### AI

ACP integrations.

---

# Tab System

I think we should borrow almost everything from VS Code.

---

## Preview Tabs

Single click:

```text
italic Note.md
```

Preview tab.

---

Double click:

```text
Note.md
```

Permanent tab.

---

Opening another preview replaces previous preview.

This is one of the best UX decisions VS Code ever made.

---

## Pinning

Support:

```text
Pin Tab
```

from V1.

---

## Tab Types

Important.

Don't make everything a file.

Instead:

```typescript
type Tab =
    | MarkdownTab
    | SearchTab
    | SettingsTab
    | ExtensionTab
    | CalendarTab
```

Otherwise you'll fight the architecture later.

---

# Split View

I think this is where we should be careful.

Obsidian's splits eventually become chaos.

I would start with:

```text
Vertical Split
Horizontal Split
Move Tab To Split
```

Only.

Not arbitrary docking yet.

---

Example:

```text
┌──────────┬──────────┐
│ Note A   │ Note B   │
└──────────┴──────────┘
```

or

```text
┌──────────┐
│ Note A   │
├──────────┤
│ Note B   │
└──────────┘
```

No floating windows.

No detachable panes.

V1 simplicity wins.

---

# Search Design

I want to discuss this now because it affects the indexer.

Current AI spec:

```text
SQLite
Tags
Links
Files
```

I think we need more.

Potential search syntax:

```text
tag:project

path:work

modified:today

type:markdown

linked:ProjectX

todo:true
```

Question:

Do you want search to become:

```text
Obsidian Search
```

or

```text
VS Code Search
```

My recommendation:

Obsidian-style structured search.

Knowledge management benefits enormously from metadata queries.

---

# Command System

This is where extensibility should start.

Everything should be a command.

Examples:

```text
New Note
Open Vault
Rename Note
Sync Git
Commit Changes
Open Graph
Toggle Backlinks
```

All commands:

```text
Ctrl+Shift+P
```

discoverable.

---

# The Most Important Architecture Decision We Haven't Made Yet

How should notes be identified?

Option A:

```text
File Path
```

```text
Projects/AI.md
```

---

Option B:

```text
UUID
```

stored in frontmatter.

```yaml
id: abc123
```

---

I strongly recommend:

```text
File Path
```

for V1.

Reason:

Git works better.

Users understand it.

Vault remains portable.

No hidden IDs.

The moment we add UUIDs, we're introducing another identity layer.

That should only happen if a future feature absolutely requires it.

---

## Next Question Set

These are the next four decisions I'd make before writing the formal UI spec:

### 1. Attachments

Should attachments be:

```text
Vault/Attachments/
```

single shared folder

or

```text
Note Folder/
    Note.md
    image.png
```

near the note?

My recommendation: configurable, but default to `Attachments/`.

---

### 2. Workspaces

Should reopening the app restore:

```text
Open Tabs
Split Layout
Scroll Positions
```

from the last session?

(My recommendation: yes)

---

### 3. Extension Marketplace

Should V1 include:

```text
Install from URL
```

only

or a full marketplace UI?

(My recommendation: URL/manual install first)

---

### 4. Themes

Should themes be:

```text
CSS-based
```

like Obsidian

or

```text
Extension-based
```

like VS Code?

My recommendation: themes are just extensions. One extension model is easier than two.

---

    ## User

I fixed the ASCII. Some of the alignment was weird:

```plaintext
┌────────────────────────────────────────────────────────────┐
│ Menu | Tabs | Right Activity Bar | Window Controls         │
├─────┬─────────────┬───────────────────────┬────────────────┤
│     │             │                       │                │
│ Act │ Left Panel  │   Main Content Area   │  Right Panel   │
│ Bar │             │                       │                │
│     │             │                       │                │
├─────┴─────────────┴───────────────────────┴────────────────┤
│ Status Bar                                                 │
└────────────────────────────────────────────────────────────┘
```

# Search Design

100% go with Obsidian style structured search. Your suggestion is great. 

# Notes identification

Your suggestion is great. Go with `File Path`.

# Attachments

Your recommendation, configurable, but default to Attachments/.

# Workspaces

Restore:

```plaintext
Open Tabs
Split Layout
Scroll Positions
```

From the last session, like you suggested. 

# Extension Marketplace

URL/manual install first

# Themes

themes are just extensions. One extension model is easier than two.

---

    ## Assistant

Excellent. We're finally getting into the part where bad assumptions become expensive, and so far I don't see any major red flags.

Your corrected layout is much better:

```text
┌────────────────────────────────────────────────────────────┐
│ Menu | Tabs | Right Activity Bar | Window Controls         │
├─────┬─────────────┬───────────────────────┬────────────────┤
│     │             │                       │                │
│ Act │ Left Panel  │   Main Content Area   │  Right Panel   │
│ Bar │             │                       │                │
│     │             │                       │                │
├─────┴─────────────┴───────────────────────┴────────────────┤
│ Status Bar                                                 │
└────────────────────────────────────────────────────────────┘
```

This is now a real application shell and not merely a note editor.

---

# What We Have Decided So Far

Before moving forward, let's consolidate the architecture that now appears stable.

## Data Ownership

Source of truth:

```text
Markdown Files
Attachments
Folders
```

Never:

```text
Database
```

---

## Indexing

```text
Vault
   ↓
File Watcher
   ↓
Indexer
   ↓
Search Database
```

Database is disposable.

Database is rebuildable.

---

## Note Identity

```text
File Path
```

Example:

```text
Projects/Project-X.md
```

No UUIDs.

No hidden IDs.

---

## Sync Model

User chooses:

```text
Git
OneDrive
Dropbox
Google Drive
iCloud
Syncthing
NAS
```

Application only sees files.

Application never becomes a cloud service.

This is a huge simplification.

---

## Attachments

Default:

```text
Vault/
├── Attachments/
```

Configurable later.

---

## Workspace Model

```text
Workspace
 ├── Active Vault
 ├── Open Tabs
 ├── Split Layout
 ├── Scroll Positions
 ├── Window State
 └── Enabled Extensions
```

Stored outside vault.

---

# A Design Decision I Want To Add

The AI draft missed this completely.

## Workspaces vs Vaults

You chose:

```text
One Vault Per Window
```

Good.

But I would define:

```text
Workspace != Vault
```

---

Example:

```text
Workspace: Personal
    Vault: Notes

Workspace: Research
    Vault: Research Vault

Workspace: Work
    Vault: Company Notes
```

Why?

Because someday you'll want:

```text
Different extensions
Different layouts
Different themes
Different settings
```

for different vaults.

If Workspace and Vault are coupled, you'll regret it later.

---

# Status Bar Design

This sounds small.

It isn't.

Status bars become extremely valuable in workspace applications.

I would define fixed zones.

Example:

```text
[Vault]
[Git]
[Indexer]
[Encoding]
[Line/Column]
[Notifications]
```

---

Examples:

```text
Research Vault
Git: 3 Changes
Indexed
UTF-8
Ln 120, Col 8
```

---

Question:

Should extensions be allowed to add status bar items?

My recommendation:

Yes.

VS Code's status bar extension model is excellent.

---

# File Explorer Design

This is where many note apps fail.

Question:

Should the Explorer show:

### Option A

Only files/folders

```text
Notes
Projects
Ideas
```

---

### Option B

Files/folders plus virtual sections

Example:

```text
Favorites
Recent
Notes
Projects
Ideas
```

---

My recommendation:

Virtual sections.

Specifically:

```text
Favorites
Recent
Files
```

built in.

Users end up needing them anyway.

---

# Tags Panel

The AI draft only said:

```text
Tag Explorer
```

I think we need to define behavior.

---

Example:

```text
#project (34)
#work (12)
#research (89)
```

---

Click:

```text
#research
```

opens search:

```text
tag:research
```

---

Not:

```text
Special tag page
```

Search should be the universal navigation system.

---

# Search Architecture

I think we should push farther than Obsidian.

Not in complexity.

In consistency.

---

Everything becomes search.

Examples:

Click tag:

```text
tag:project
```

---

Click backlink:

```text
linked:Project-X
```

---

Click folder:

```text
path:Projects
```

---

Click task filter:

```text
todo:true
```

---

This creates one unified discovery engine.

Much easier to maintain.

---

# Editor Design

This is where I see our next potentially expensive decision.

You selected:

```text
CodeMirror 6
```

Good.

Very good.

Actually probably the correct choice.

---

But I want to challenge one thing.

Many apps make the editor responsible for everything.

I think that's a mistake.

---

Instead:

```text
Editor
```

should only know:

```text
Text
Selections
Decorations
Commands
```

---

And then:

```text
Wiki Links
Tags
Tasks
Backlinks
Embeds
AI Actions
```

should be editor extensions.

Even first-party ones.

---

Reason:

Your plugin system becomes the same system you use internally.

That almost always leads to a healthier architecture.

---

# Biggest Unresolved UI Question

I think we've reached the next major decision.

How should Settings work?

### Option A

Single giant settings page

Like Obsidian.

---

### Option B

VS Code style

Searchable settings registry.

Example:

```text
Search Settings

Editor Font Size
Git Auto Sync
AI Provider
Theme
```

---

My recommendation:

VS Code style.

Why?

Because eventually you'll have:

```text
Core Settings
Git Settings
Theme Settings
Extension Settings
AI Settings
```

and categories become difficult to navigate.

Search scales forever.

---

# Another Potentially Important Question

How should Commands be exposed?

### Only Command Palette

```text
Ctrl+Shift+P
```

---

### Command Palette + Action Search

Example:

Right click file:

```text
Rename
Move
Delete
Open Split
Reveal In Explorer
```

powered by the same command system.

---

My recommendation:

Everything is a command.

Menus simply invoke commands.

This is another VS Code lesson worth stealing.

---

# One Concern About AI ACP Integration

I want to raise this now before it becomes expensive.

Current thinking:

```text
AI Panel
→ ACP Agent
→ Agent edits vault
```

Sounds good.

But we need a permissions model.

Question:

When an ACP agent attempts:

```text
Edit file
Delete file
Rename file
Run command
```

Should it:

### A

Just do it

### B

Prompt every time

### C

Workspace permissions

Example:

```text
Allow:
✓ Read Vault

Allow:
✓ Edit Vault

Allow:
✗ Delete Files

Allow:
✗ Run Commands
```

My recommendation is C.

Otherwise you'll eventually have people accidentally destroying notes.

---

The next thing I would design is:

1. Command system
2. Extension system
3. Settings system
4. ACP permissions model

Those four pieces will define almost every future feature.

---

    ## User

That looks great. Go with your suggestions here too for each of those questions. I like the back and forth with choosing the best stuff from each. 

When we create the spec, let's split it into a summary doc that every agent shares and a set of feature docs that a set of sub agents can work on without causing conflicts.

---

    ## Assistant

I think that's exactly the right approach.

Right now we're still in the **architecture discovery phase**, not the specification writing phase. The goal is to eliminate future regrets before they become code.

One thing I've noticed about your previous projects is that you tend to think in terms of modular systems (your voice assistant, widget platform, agent platform designs all leaned this way). That fits this application extremely well.

So instead of producing:

```text
SPEC.md
```

I would eventually produce:

```text
docs/
├── 00-project-summary.md
├── 01-architecture.md
├── 02-ui-shell.md
├── 03-editor.md
├── 04-search-indexing.md
├── 05-vaults-workspaces.md
├── 06-git-sync.md
├── 07-extensions.md
├── 08-command-system.md
├── 09-settings-system.md
├── 10-acp-integration.md
├── 11-mobile-strategy.md
├── 12-theme-system.md
└── roadmap.md
```

with a strict rule:

```text
00-project-summary.md
```

is the source of truth.

Every coding agent reads it first.

Everything else is a detailed implementation document.

---

# Why This Matters

Many multi-agent projects fail because agents work from different assumptions.

Example:

Editor agent assumes:

```text
Notes use UUIDs
```

Search agent assumes:

```text
Notes use paths
```

Git agent assumes:

```text
Database is source of truth
```

Now you have three incompatible systems.

The summary document should contain only immutable decisions:

```text
Files are source of truth
One vault per window
Workspace != Vault
Path-based note identity
Markdown-first editor
Extensions are first-class
User owns sync
```

Nothing implementation-specific.

---

# I Think We've Locked Most Core Architecture

The remaining dangerous areas are:

## Extension Architecture

This is probably the largest unresolved system.

Not because it's difficult.

Because it determines what every future feature looks like.

---

Current direction:

Extensions can:

```text
Add Commands
Add Activity Views
Add Right Panel Views
Add Settings
Add Themes
Add Editor Extensions
```

but cannot initially:

```text
Access Filesystem Directly
Execute Shell Commands
Run Arbitrary Native Code
```

I think that's correct for V1.

---

# Question: Web Extensions or Local Extensions?

Option A:

```text
extension/
├── manifest.json
├── main.js
└── assets/
```

Like VS Code.

---

Option B:

Rust-based native plugins.

---

My recommendation:

Option A.

Without hesitation.

The moment Rust plugins enter the picture:

```text
Windows
Mac
Linux
ABI compatibility
Versioning
```

becomes a nightmare.

---

# Editor Architecture Question

I think we're close to a major decision here.

Current thinking:

```text
CodeMirror 6
```

Excellent.

But should editor features be:

### Built-in

```text
Wiki Links
Tasks
Tags
Embeds
Tables
```

---

### Internal Extensions

Built using the same extension API available to third parties.

---

I strongly recommend:

```text
Internal Extensions
```

Example:

```text
core-editor
core-tags
core-links
core-tasks
```

all implemented through the same extension system.

---

Why?

Because you'll discover flaws in your extension API before external developers do.

VS Code benefits enormously from this philosophy.

---

# Git Architecture

We've agreed on:

```text
User Owns Sync
```

which is excellent.

But we still need to decide:

### Git Engine

Option A

Call system git.

---

Option B

Embed git library.

---

I recommend:

```text
Call system git
```

first.

Reason:

Users already have:

```text
git
gh
ssh
credential managers
```

configured.

Using their existing setup avoids enormous complexity.

Later you can fall back to an embedded implementation.

---

# Search Architecture

I think we should make one very important decision now.

Search database should index:

```text
Files
Folders
Tags
Wiki Links
Headings
Tasks
Frontmatter
```

from the beginning.

---

Not:

```text
Files
Tags
```

and then later:

```text
Oh, now we need tasks.
```

because that leads to schema churn.

---

# Mobile Strategy

This is where I disagree with most teams.

Most teams say:

```text
Build Desktop
Then Build Mobile
```

The result:

Desktop architecture accidentally becomes impossible to reuse.

---

Instead:

During desktop development:

```text
Design Mobile Interfaces
Do Not Build Mobile UI Yet
```

Huge difference.

---

Example:

Don't write:

```typescript
TauriFileSystem
```

everywhere.

Write:

```typescript
IFileSystem
```

and then implement:

```typescript
DesktopFileSystem
MobileFileSystem
```

later.

---

This keeps the door open without slowing desktop development.

---

# The Biggest Remaining Unknown

I think we've arrived at the next major architecture decision.

And it's surprisingly important.

## What is a Note?

Seems obvious.

It isn't.

Options:

### A

A note is simply a markdown file.

```text
My Note.md
```

---

### B

A note is a markdown document with optional metadata.

```yaml
---
title:
tags:
status:
---
```

---

### C

A note is a markdown document plus application-managed metadata.

---

My recommendation:

B.

Very strongly B.

The application should understand:

```yaml
---
title:
tags:
aliases:
created:
updated:
---
```

but never require them.

This preserves portability while enabling powerful features.

---

So the next discussion I'd have before writing any documents is:

### Frontmatter Schema

What metadata should the application officially recognize?

For example:

```yaml
title:
tags:
aliases:
created:
updated:
status:
```

Some of those become search features, backlink features, graph features, and AI features later.

This is one of those deceptively small decisions that affects the entire ecosystem.

---

    ## User

# Web extensions or local extensions  

Option A, like vs code. Again, good suggestion.   

# Editor Architecture Question  

Like you recommended, Internal Extensions with CodeMirror 6. It's a good idea and way simpler.   

# Git Architecture  

Go with system git initially. Just solves so many dev problems for now. Falling back later is a great idea.   

# What is a note?  

A note is a markdown document with optional metadata, like you said.   

# Frontmatter Schema  

```plaintext
title:  
tags:  
aliases:  
created:  
updated:  
status:
```

Good baseline. But let's add the creation and last edited date and time in as well. 

Let's write the first set of specs lest the design decisions we have get lost in a long context chat. Don't let anything get lost in discussion. You can be brief but don't let any of our decisions go unspoken. 

Once it's written, we can keep answering questions. 

Anything critical before they're written? Make sure the summary file can be passed to every agent.

---

    ## Assistant

Yes. There is one critical decision I want recorded before anything is written because it affects every subsystem:

### Internal Metadata Storage

We have decided:

```text
User Data → Markdown Files
Application Data → AppData/Config Directory
```

Therefore:

```text
Open Tabs
Window Layout
Workspace State
Search Database
Cache
Extension State
AI Session State
```

must NEVER be written into the vault.

That is important enough to be in the summary document because it affects every team.

Other than that, I think we have enough stability to write the first specification.

The first document should be intentionally short, opinionated, and immutable. Every agent should read it before touching code.

---

:::writing{variant="document" id="58241"}

# 00-project-summary.md

## Project Overview

This application is a cross-platform Markdown workspace focused on local-first knowledge management.

The application is inspired by VS Code and Obsidian, but follows a strict architecture centered around user ownership of data, extensibility, portability, and long-term maintainability.

The application is not a cloud service and does not require proprietary synchronization infrastructure.

---

# Core Principles

## User Owns Data

All user content is stored as standard files and folders.

User notes must remain usable outside the application.

The application must never lock user data into a proprietary format.

---

## Files Are Source Of Truth

Markdown files are the authoritative source of data.

Databases, indexes, caches, and application state are derived from files and must be rebuildable.

The application must never require a database to recover note content.

---

## User Owns Sync

The application does not implement proprietary synchronization.

Users may place vaults inside:

* Git repositories
* OneDrive
* Dropbox
* Google Drive
* iCloud
* Syncthing
* NAS shares
* Standard filesystem locations

The application operates entirely on files and folders.

---

## Extension First Architecture

Major functionality should be implemented through the same extension system available to third-party developers whenever practical.

The extension system is a core platform feature, not an afterthought.

---

## Markdown First

Notes are Markdown documents.

The editor provides live markdown rendering and rich editing behavior while preserving clean Markdown files.

Markdown compatibility and portability are prioritized over WYSIWYG abstractions.

---

# Application Structure

## Vault

A vault is a user-selected directory containing notes and attachments.

Example:

Vault/

├── Notes/

├── Attachments/

├── Templates/

The vault contains user content only.

Application metadata must never be stored in the vault.

---

## Workspace

A workspace represents application state associated with a vault.

Workspace state includes:

* Open tabs
* Split layouts
* Scroll positions
* Window state
* Enabled extensions
* Workspace preferences

Workspace state is stored outside the vault.

Workspace and vault are separate concepts.

---

# Storage Rules

## Allowed Inside Vault

* Markdown files
* Attachments
* Templates
* User-created content

## Forbidden Inside Vault

* Databases
* Cache files
* Search indexes
* Extension state
* Application settings
* Window state
* AI session data

---

# Note Model

A note is a Markdown document with optional frontmatter.

Example:

---

title:

tags:

aliases:

status:

created:

updated:

created_at:

updated_at:

---

Frontmatter is optional.

Notes are identified by file path.

No UUID system is used.

Example:

Projects/Architecture.md

is the note identifier.

---

# Search Architecture

Files are indexed using:

Vault

→ File Watcher

→ Indexer

→ Search Database

The search database is disposable and rebuildable.

The search database is never authoritative.

---

# Desktop Architecture

Desktop is the primary platform.

Technology stack:

* Tauri
* React
* TypeScript
* CodeMirror 6

Git integration initially uses the system Git installation.

---

# Mobile Strategy

Desktop is the initial priority.

Mobile support must be considered during architecture design.

Business logic should be shared through reusable packages.

User interface implementations remain platform-specific.

---

# Extension Model

Extensions are web-based extensions similar to VS Code.

Extensions may:

* Add commands
* Add activity views
* Add right panel views
* Add editor extensions
* Add settings
* Add themes

Initial extension model does not allow:

* Direct filesystem access
* Shell execution
* Native code execution

---

# Themes

Themes are extensions.

A separate theme system does not exist.

---

# Commands

Commands are the primary interaction model.

All major functionality should be exposed through commands.

Menus, buttons, context menus, and shortcuts invoke commands.

Command Palette support is required.

---

# AI Integration

AI functionality is provided through ACP-compatible integrations.

AI providers are treated as integrations rather than core application logic.

AI session state must remain outside the vault.

Workspace-level permissions control AI capabilities.

---

# Conflict Resolution

The application must support conflict detection for:

* Git merge conflicts
* Cloud synchronization conflicts
* Duplicate sync files

Conflict resolution uses a unified merge interface.

---

# Non-Negotiable Rules

1. Files are the source of truth.
2. User data must remain portable.
3. Vaults must remain compatible with external tools.
4. Application state must remain outside the vault.
5. Search databases must be rebuildable.
6. Notes are identified by file paths.
7. Extensions are first-class architecture.
8. Commands are first-class architecture.
9. Themes are extensions.
10. The application never requires proprietary cloud infrastructure.

:::

This is the document I'd hand to every coding agent.

Before writing the next spec, there are only two major architecture decisions I still consider "dangerous" enough to settle early:

1. **Extension sandbox and permission model** (this determines long-term security and marketplace viability).
2. **Frontmatter schema ownership** — whether `created`, `updated`, `created_at`, and `updated_at` are automatically managed by the application or treated as user-editable fields.

I'd resolve those before writing `01-architecture.md` because they affect the storage and indexing layers.

---

    ## User

Go ahead and choose on each. Just ensure the extension marketplace isn't overly complicated, but isn't insecure. Then fill out the rest of the files and include a list of Todo questions on each. That way we don't lose the detail we've spent on this time writing.

---

    ## Assistant

I would make the following decisions now rather than leaving them open:

### Extension Security Model

V1 should use a capability-based permission model.

Extensions declare permissions in `manifest.json`.

Example:

```json
{
  "permissions": [
    "commands",
    "editor",
    "views",
    "settings"
  ]
}
```

Future permissions:

```json
{
  "permissions": [
    "vault.read",
    "vault.write",
    "git",
    "network"
  ]
}
```

The important part:

```text
Default = No Access
```

Extensions get only what they request.

This keeps the marketplace simple while avoiding a future security rewrite.

---

### Frontmatter Ownership

I would split metadata into two categories.

User-managed:

```yaml
title:
tags:
aliases:
status:
```

Application-managed:

```yaml
created:
updated:
created_at:
updated_at:
```

Rules:

```text
created
created_at
```

set once.

```text
updated
updated_at
```

automatically updated on save.

Users may edit them manually if desired, but the application treats them as managed fields.

This gives us consistent indexing, sorting, search, and graph features.

---

At this point I think we can safely define the complete document structure.

Instead of writing thousands of lines immediately, I'd define the contract for every document now so multiple agents can work in parallel without stepping on each other.

---

:::writing{variant="document" id="73184"}

# Documentation Structure

docs/

├── 00-project-summary.md

│   Shared source of truth.

│   Required reading for every agent.

│

├── 01-architecture.md

│   System architecture.

│   Package boundaries.

│   Data flow.

│   Dependency rules.

│

├── 02-ui-shell.md

│   Desktop layout.

│   Activity bar.

│   Panels.

│   Tabs.

│   Status bar.

│   Split views.

│

├── 03-editor.md

│   CodeMirror architecture.

│   Markdown rendering.

│   Internal editor extensions.

│   Commands.

│

├── 04-search-indexing.md

│   File watcher.

│   Indexer.

│   Search database.

│   Search syntax.

│   Tag system.

│

├── 05-vaults-workspaces.md

│   Vault lifecycle.

│   Workspace lifecycle.

│   Session restoration.

│

├── 06-git-sync.md

│   Git integration.

│   Conflict detection.

│   Merge UI.

│   Cloud sync conflicts.

│

├── 07-extension-system.md

│   Extension runtime.

│   Manifest format.

│   Permission model.

│   Views.

│   Commands.

│   Themes.

│

├── 08-command-system.md

│   Command registry.

│   Command palette.

│   Context menus.

│   Keyboard shortcuts.

│

├── 09-settings-system.md

│   Searchable settings.

│   Settings registry.

│   Extension settings.

│

├── 10-acp-integration.md

│   Agent Context Protocol.

│   Provider abstraction.

│   Permission controls.

│   Workspace access.

│

├── 11-mobile-strategy.md

│   Shared packages.

│   Mobile architecture.

│   Future implementation plan.

│

├── 12-theme-system.md

│   Theme extension model.

│   CSS variables.

│   Theme API.

│

├── 13-frontmatter-schema.md

│   Metadata definitions.

│   Managed fields.

│   Search behavior.

│

├── 14-roadmap.md

│   Phases.

│   Milestones.

│   Release planning.

│

└── todos/

    ├── ui-open-questions.md

    ├── editor-open-questions.md

    ├── extension-open-questions.md

    ├── mobile-open-questions.md

    └── future-features.md

:::

Before writing the remaining files, there are only **three architectural questions** I still consider important enough to capture now:

### 1. Extension Distribution

My recommendation:

V1:

```text
Install From URL
Install From File
```

No marketplace server.

Later:

```text
Static extension registry
```

served from GitHub Pages or similar.

No custom backend required.

---

### 2. Search Database Technology

Current architecture says:

```text
Search Database
```

but not which database.

My recommendation:

```text
SQLite + FTS5
```

Why:

* already available
* cross-platform
* fast
* proven
* no additional service

This fits perfectly with the disposable-index philosophy.

---

### 3. Internal Package Layout

I would strongly recommend moving away from a giant `core` package and defining packages immediately:

```text
packages/
├── filesystem
├── markdown
├── indexer
├── search
├── commands
├── workspace
├── extensions
├── git
├── settings
├── shared-types
└── ui-contracts
```

This prevents the classic:

```text
core/
  80,000 lines
```

problem six months from now.

If you're good with those three decisions, I think we can begin writing the actual implementation specs (`01-architecture.md`, `02-ui-shell.md`, etc.) without much risk of major rewrites later.

---

    ## User

Those look like great suggestions. I approve each, especially the package layout.

---

    ## Assistant

Perfect. At this point I think we've crossed the line from "brainstorming" into "architecture."

The good news is that I don't see any foundational decisions that are likely to force a rewrite later. The architecture is becoming very coherent:

```text
Markdown Files
      ↓
File Watcher
      ↓
Indexer
      ↓
SQLite FTS5 Search Database
      ↓
Search / Tags / Backlinks / Graph
```

with:

```text
User Data
    ≠
Application Data
```

and:

```text
Vault
    ≠
Workspace
```

which are two of the biggest mistakes note applications usually make.

---

# What I Think We Have Locked

These should now be considered architectural decisions, not open discussions.

### Platform

```text
Desktop First

Tauri
React
TypeScript
CodeMirror 6
```

Future:

```text
React Native Mobile
```

using shared packages.

---

### Storage

```text
Markdown Files
Attachments
Folders
```

inside vault.

Nothing else.

---

### Metadata

```yaml
---
title:
tags:
aliases:
status:

created:
updated:
created_at:
updated_at:
---
```

User fields:

```yaml
title:
tags:
aliases:
status:
```

Managed fields:

```yaml
created:
updated:
created_at:
updated_at:
```

---

### Search

```text
SQLite
FTS5
```

Disposable.

Rebuildable.

Never authoritative.

---

### Git

```text
System Git
```

for V1.

---

### Sync

```text
User Owns Sync
```

Git.

OneDrive.

Dropbox.

Google Drive.

iCloud.

Syncthing.

NAS.

---

### Extensions

```text
Web Extensions
```

Like VS Code.

No native plugins.

No Rust plugins.

---

### Themes

```text
Themes Are Extensions
```

Single extension model.

---

### Commands

Everything is a command.

```text
Menus
Context Menus
Buttons
Hotkeys
Command Palette
```

all invoke commands.

---

### AI

```text
ACP Integrations
```

Provider architecture.

Permission controlled.

Not tightly coupled to application internals.

---

# What I Would Put Into 01-architecture.md

The next document should establish boundaries.

Something like:

```text
apps/
├── desktop
└── mobile

packages/
├── filesystem
├── markdown
├── indexer
├── search
├── commands
├── workspace
├── extensions
├── git
├── settings
├── shared-types
└── ui-contracts
```

And then explicitly define:

```text
Allowed Dependencies
```

because this prevents future chaos.

Example:

```text
search
  may depend on:
    shared-types

  may not depend on:
    ui-contracts
```

That sounds boring, but it saves projects.

---

# What I Would Put Into 02-ui-shell.md

This document is now almost completely defined.

Current layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Menu | Tabs | Right Activity Bar | Window Controls         │
├─────┬─────────────┬───────────────────────┬────────────────┤
│     │             │                       │                │
│ Act │ Left Panel  │   Main Content Area   │  Right Panel   │
│ Bar │             │                       │                │
│     │             │                       │                │
├─────┴─────────────┴───────────────────────┴────────────────┤
│ Status Bar                                                 │
└────────────────────────────────────────────────────────────┘
```

Built-in Activity Bar:

```text
Explorer
Search
Tags
Calendar
Tasks
Git
Extensions
Settings
```

Built-in Right Panel:

```text
Outline
Properties
Backlinks
History
AI
```

Graph:

```text
Official Extension
```

not core.

---

# The Last Big Architectural Question

There is really only one remaining item I'd want answered before generating the full set of implementation docs.

## Tasks

Should tasks be:

### Option A

Pure Markdown Checkboxes

```md
- [ ] Buy milk
- [x] Call Bob
```

and everything derives from markdown.

---

### Option B

Special Task Objects

with metadata.

---

I strongly recommend:

### Option A

because it preserves:

```text
Markdown Portability
```

and keeps tasks searchable/indexable.

Then we can extend with syntax later:

```md
- [ ] Finish design
  due: 2026-06-15
```

or

```md
- [ ] Finish design #task @today
```

without creating a separate task system.

That is the last place I currently see where a seemingly small decision could accidentally create a second database hidden inside the application.

If you agree with Markdown-first tasks, I think we're ready to generate the actual architecture and UI specification documents in a form that coding agents can start implementing against.

---

    ## User

I fully agree, markdown first. If that's good, let's write the spec!

---

    ## Assistant

Yes. I think we have enough architectural certainty to begin implementation specs.

One note before the docs: I would **freeze the summary document**. Future discussions can change implementation docs, but changes to `00-project-summary.md` should be treated like RFCs because that file is the foundation every coding agent reads.

Below is the architecture index and the first-pass content outline for the implementation docs.

:::writing{variant="document" id="28471"}

# 01-architecture.md

## Purpose

Defines system boundaries, package ownership, dependency rules, and data flow.

---

# Repository Structure

apps/

├── desktop/

└── mobile/

packages/

├── filesystem/

├── markdown/

├── indexer/

├── search/

├── commands/

├── workspace/

├── extensions/

├── git/

├── settings/

├── shared-types/

└── ui-contracts/

docs/

---

# Dependency Rules

shared-types

  No internal dependencies.

filesystem

  Depends on shared-types.

markdown

  Depends on shared-types.

indexer

  Depends on:

    filesystem

    markdown

    shared-types

search

  Depends on:

    indexer

    shared-types

commands

  Depends on:

    shared-types

workspace

  Depends on:

    shared-types

extensions

  Depends on:

    commands

    shared-types

    ui-contracts

git

  Depends on:

    filesystem

    shared-types

settings

  Depends on:

    shared-types

desktop

  May depend on all packages.

mobile

  May depend on all packages.

Packages must never depend on UI implementations.

---

# Data Flow

Vault

  ↓

File Watcher

  ↓

Indexer

  ↓

SQLite FTS5

  ↓

Search Services

Markdown files remain authoritative.

Search database remains disposable.

---

# Core Interfaces

IFileSystem

IMarkdownParser

IIndexer

ISearchService

ICommandRegistry

IWorkspaceManager

IExtensionHost

IGitProvider

ISettingsRegistry

---

# TODO Questions

* Mobile filesystem adapter details.
* Background indexing scheduling.
* Search ranking strategy.

:::

:::writing{variant="document" id="28472"}

# 02-ui-shell.md

## Window Layout

┌────────────────────────────────────────────────────────────┐

│ Menu | Tabs | Right Activity Bar | Window Controls         │

├─────┬─────────────┬───────────────────────┬────────────────┤

│     │             │                       │                │

│ Act │ Left Panel  │   Main Content Area   │  Right Panel   │

│ Bar │             │                       │                │

│     │             │                       │                │

├─────┴─────────────┴───────────────────────┴────────────────┤

│ Status Bar                                                 │

└────────────────────────────────────────────────────────────┘

---

# Activity Bar

Built-In Views

* Explorer
* Search
* Tags
* Calendar
* Tasks
* Git
* Extensions
* Settings

Extensions may contribute views.

---

# Left Panel

Context-sensitive.

Explorer:

  Vault tree

  Favorites

  Recent

Search:

  Query

  Filters

  Results

Tags:

  Tag browser

Git:

  Source control view

Extensions:

  Installed extensions

---

# Main Content Area

Supports:

* Tabs
* Split views
* Preview tabs
* Pinned tabs

Tab Types:

* Markdown
* Search
* Settings
* Calendar
* Extension

---

# Right Activity Bar

Built-In Views

* Outline
* Properties
* Backlinks
* History
* AI

Extensions may contribute views.

---

# Right Panel

Collapsible.

Selecting active icon collapses panel.

---

# Status Bar

Built-In Items

* Current Vault
* Git Status
* Index Status
* Encoding
* Cursor Position
* Notifications

Extensions may contribute status items.

---

# TODO Questions

* Multi-monitor support.
* Dragging tabs between windows.
* Future floating panels.

:::

:::writing{variant="document" id="28473"}

# 03-editor.md

## Editor Technology

CodeMirror 6

Markdown-first editing.

Live markdown rendering.

No true WYSIWYG mode.

---

# Internal Editor Extensions

* Wiki Links
* Tags
* Tasks
* Embeds
* Tables
* Backlinks
* Frontmatter

Core features use the same extension APIs available to third-party developers.

---

# Note Model

Markdown file with optional frontmatter.

Example:

---

title:

tags:

aliases:

status:

created:

updated:

created_at:

updated_at:

---

---

# Task Model

Markdown checkboxes only.

Example:

* [ ] Design UI
* [x] Finish indexing

Tasks are indexed from markdown.

No separate task database exists.

---

# Attachments

Default:

Vault/Attachments/

Drag-and-drop supported.

Automatically inserts relative links.

Configurable in future.

---

# TODO Questions

* Image embedding behavior.
* Mermaid support.
* Math rendering support.

:::

The next files should be generated similarly:

* `04-search-indexing.md`
* `05-vaults-workspaces.md`
* `06-git-sync.md`
* `07-extension-system.md`
* `08-command-system.md`
* `09-settings-system.md`
* `10-acp-integration.md`
* `11-mobile-strategy.md`
* `12-theme-system.md`
* `13-frontmatter-schema.md`
* `14-roadmap.md`

I would especially prioritize `07-extension-system.md` and `10-acp-integration.md` next because they will determine most future development patterns. Those two documents are where the remaining high-impact design decisions live.

---

    ## User

Sounds good! Write those up and I'll copy them to the repo plans folder. Then we can keep planning. If more questions arise ask away! As always recommend what you think is best.

---

    ## Assistant

I like where this is going. One thing I think will pay off enormously is treating the repository like a real software product from day one. Every major subsystem gets exactly one design document, one implementation document, and one TODO list. That prevents the architecture from drifting as multiple coding agents start working.

I also think we should write one document that every coding agent reads first before doing anything else.

---

# Repository Structure

```text
plans/
│
├── 000-project-overview.md
├── 001-core-principles.md
├── 002-roadmap.md
│
├── architecture/
│   ├── app-architecture.md
│   ├── editor.md
│   ├── extension-system.md
│   ├── git.md
│   ├── workspace.md
│   ├── notes.md
│   ├── search.md
│   ├── ai.md
│   ├── sync.md
│   └── settings.md
│
├── implementation/
│   ├── frontend.md
│   ├── backend.md
│   ├── database.md
│   ├── testing.md
│   └── deployment.md
│
└── todos/
    ├── editor.md
    ├── extensions.md
    ├── ai.md
    ├── git.md
    ├── search.md
    └── sync.md
```

This keeps architecture separate from implementation, which keeps agents from mixing design decisions with code decisions.

---

# 000-project-overview.md

```markdown
# Project Overview

## Vision

Build an open, privacy-first knowledge workspace inspired by Obsidian and VS Code.

The application should be:

- Fast
- Local-first
- Markdown-first
- Extensible
- AI-native
- Git-friendly
- Cross platform

Users own their files.

No proprietary note format.

Everything is stored as normal Markdown files.

The project is designed to scale from a lightweight note editor into a complete knowledge platform.

---

## Core Technologies

Frontend
- React
- TypeScript
- Vite

Desktop
- Tauri

Editor
- CodeMirror 6

Backend
- Rust

Storage
- Markdown
- JSON configuration

Git
- System Git initially

AI
- Local and remote providers

Extensions
- Internal extension API
```

---

# 001-core-principles.md

```markdown
# Core Principles

## Markdown First

Markdown files are the source of truth.

No database lock-in.

---

## Local First

Everything works offline.

Internet features are optional.

---

## Fast

Instant startup.

Minimal memory usage.

Lazy loading.

---

## Simple

Avoid unnecessary abstractions.

Prefer understandable code over clever code.

---

## Extensible

Everything should be replaceable through the extension API.

---

## Privacy

User owns their data.

No telemetry by default.

No vendor lock-in.

---

## Git Friendly

Projects are normal folders.

Files are normal Markdown.

Compatible with Git, GitHub, GitLab, etc.

---

## AI Native

AI should enhance workflows.

AI is optional.

Local models are fully supported.

Cloud providers are optional.
```

---

# architecture/editor.md

```markdown
# Editor

## Decision

CodeMirror 6

Reasons

- Lightweight
- Extensible
- Excellent Markdown support
- Mature ecosystem
- Easier than Monaco
- Better mobile support

---

## Features

Markdown editing

Syntax highlighting

Code blocks

Tables

Lists

Images

Footnotes

Wiki links

Mermaid

Callouts

Math

Multiple cursors

Search

Replace

Undo history

---

## Extensions

Editor functionality is implemented using internal extensions.

No WebExtension architecture.

No Electron plugin model.

Simple API.

---

## Future

Optional Monaco editor package.

Not part of MVP.
```

---

# architecture/extensions.md

```markdown
# Extension System

## Philosophy

Keep extensions simple.

Avoid browser-like complexity.

Avoid security problems.

---

## Package Layout

extension.json

main.ts

assets/

README.md

LICENSE

---

## Capabilities

Commands

Views

Panels

Menus

Editor actions

Settings

Themes

Language support

AI tools

Git tools

---

## Security

Permissions declared in manifest.

No unrestricted filesystem access.

Sandboxed execution.

No native code.

Signed marketplace packages.

Local sideloading always allowed.
```

---

# architecture/git.md

```markdown
# Git

Decision

Use system Git.

Reasons

Reliable

Familiar

Works with SSH

Works with credentials

Supports every Git feature.

---

Future

Optional embedded Git implementation.

Fallback only.

---

Features

Commit

Push

Pull

Branch

Merge

Diff

History

Conflict viewer

Staging

Discard changes

Repository initialization
```

---

# architecture/notes.md

```markdown
# Notes

A note is a Markdown document.

Metadata uses YAML frontmatter.

---

Schema

title

tags

aliases

created_date

created_time

updated_date

updated_time

status

---

Body

Markdown only.

No proprietary formatting.

Everything remains readable in any editor.

---

Attachments

Stored beside notes.

Referenced using relative paths.
```

---

# architecture/workspace.md

```markdown
# Workspace

A workspace is a folder.

Multiple workspaces are supported.

Workspace settings are stored separately from user settings.

Projects remain portable.

Opening a workspace never modifies user files unnecessarily.
```

---

# architecture/ai.md

```markdown
# AI

Provider abstraction.

Supported

OpenAI

Anthropic

Google

Ollama

LM Studio

OpenRouter

Future providers via adapters.

Models are configurable.

AI features degrade gracefully when disabled.

No provider-specific logic inside UI.
```

---

# architecture/search.md

```markdown
# Search

Phase 1

Filename

Markdown text

Tags

Aliases

---

Phase 2

Fuzzy search

Regex

Filters

Metadata

Date

---

Phase 3

Semantic search

Embeddings

AI-assisted discovery
```

---

# architecture/settings.md

```markdown
# Settings

Three levels

Application

Workspace

Extension

JSON format.

Human readable.

Versioned.

Migration support included.
```

---

# 002-roadmap.md

```markdown
# Roadmap

## Phase 1

Markdown editor

Workspace

File explorer

Search

Git

Settings

Themes

Internal extensions

---

## Phase 2

Graph

Canvas

AI

Command palette improvements

Workspace improvements

---

## Phase 3

Marketplace

Collaboration

Sync

Semantic search

Publishing

Advanced plugins
```

---

# TODO Documents

Every TODO file follows the same pattern.

```markdown
# TODO

## Remaining Decisions

- ...

## Nice to Have

- ...

## Future Ideas

- ...

## Deferred

- ...
```

For example, `todos/ai.md` might contain:

```markdown
# AI TODO

## Remaining Decisions

- Prompt template storage
- Conversation history format
- Agent permissions
- Tool execution limits

## Nice to Have

- Multi-agent workflows
- Local RAG
- Voice assistant

## Future

- Autonomous background agents
- Scheduled agents
- MCP integration

## Deferred

- Fine-tuning support
```

---

## A few more architectural decisions I'd make now

These are small decisions now, but they eliminate many future debates:

* **Configuration format:** JSON (not YAML or TOML) for app settings; YAML only for note frontmatter.
* **Package manager:** `pnpm`.
* **Monorepo:** Yes, using Turborepo.
* **Code quality:** ESLint + Prettier + Biome for formatting/linting.
* **Testing:** Vitest (unit), Playwright (end-to-end), Rust tests for backend.
* **State management:** Zustand (keep it simple; avoid Redux unless it becomes necessary).
* **Data validation:** Zod for TypeScript and Serde for Rust.
* **IPC:** Strongly typed Tauri commands only—no raw string-based APIs.
* **Logging:** Structured logging from the beginning.
* **Extension API:** Semantic versioning (v1, v2, etc.) with backwards compatibility where practical.
* **Markdown parser:** `remark` ecosystem for maximum compatibility.
* **Document IDs:** No hidden IDs—file paths are the canonical identity, preserving Git friendliness.

I think this is an excellent foundation. These documents are concise enough for every coding agent to read in a few minutes, while capturing nearly all of the architectural decisions we've made so far. As we continue planning, we can add more detailed design docs without risking the core vision getting lost.

---

    ## User

Those are great thoughts! Go ahead and add them to the design docs. Explain why each goes where you put it. Finally, let me know which docs should go where in the repo and we'll declare the plan complete! Any outstanding questions should be written to a final questions markdown file for the team to address.

---

    ## Assistant

I think we're at the point where the architecture is becoming stable enough that we should separate **"architecture"** from **"project management."** That's something a lot of open-source projects don't do until it's too late, and it makes onboarding much easier.

Here's how I'd organize everything.

---

# Repository Layout

```plaintext
repo/
│
├── apps/
│   ├── desktop/
│   ├── web/
│   └── docs/
│
├── packages/
│   ├── core/
│   ├── editor/
│   ├── extension-api/
│   ├── git/
│   ├── search/
│   ├── markdown/
│   ├── ui/
│   ├── ai/
│   ├── settings/
│   ├── filesystem/
│   └── shared/
│
├── extensions/
│
├── scripts/
│
├── tests/
│
├── plans/
│
├── docs/
│
└── README.md
```

---

# Why two documentation folders?

I would intentionally split them.

## `/plans`

Planning documents.

These change frequently.

Architecture decisions

Roadmaps

Open questions

Future features

TODOs

These are written for developers.

---

## `/docs`

Permanent documentation.

API documentation

Extension documentation

User guides

Installation

Contributing

Release notes

These are eventually published.

This separation keeps planning from polluting permanent documentation.

---

# Updated Planning Folder

```plaintext
plans/

000-project-overview.md
001-core-principles.md
002-roadmap.md
003-open-questions.md

architecture/

app-architecture.md
editor.md
workspace.md
notes.md
filesystem.md
settings.md
search.md
git.md
extensions.md
ai.md
security.md
performance.md
testing.md

implementation/

frontend.md
backend.md
database.md
deployment.md

todos/

editor.md
git.md
search.md
extensions.md
ai.md
performance.md
```

---

# Where the new decisions belong

## pnpm

**architecture/app-architecture.md**

Why?

Package management affects the entire repository.

It isn't a frontend decision.

It isn't a build decision.

It's an architecture decision.

```plaintext
Decision

pnpm

Reasons

Fast

Efficient

Excellent monorepo support

Widely adopted

Compatible with Turborepo
```

---

## Turborepo

Also

**architecture/app-architecture.md**

Because it's the repository architecture.

Not frontend.

Not backend.

Entire repository.

---

## Zustand

**architecture/frontend.md**

Reason

Only React uses it.

The Rust backend doesn't care.

---

## Zod

**architecture/frontend.md**

Reason

Frontend validation.

Type safety.

Runtime validation.

---

## Serde

**architecture/backend.md**

Reason

Rust serialization.

Configuration.

IPC.

Persistence.

---

## Remark

**architecture/notes.md**

Reason

Markdown implementation belongs with notes.

---

## Structured Logging

**architecture/performance.md**

Reason

Logging isn't a backend feature.

It's an operational feature.

```plaintext
Goals

Machine readable

Log levels

File logging

Console logging

Extension logging

Crash reports
```

---

## Typed IPC

**architecture/backend.md**

Reason

It's the contract between Rust and TypeScript.

---

## Semantic Versioning

**architecture/extensions.md**

Because it affects plugin compatibility.

```plaintext
Extension API v1

Backwards compatibility guaranteed.

Breaking changes only occur with major versions.
```

---

## File paths are IDs

**architecture/filesystem.md**

This deserves its own document.

```plaintext
Notes have no UUID.

Files are identified by path.

Advantages

Git friendly

Readable

Portable

No hidden metadata

No lock-in
```

---

## JSON Settings

Already belongs in

**architecture/settings.md**

---

# I would also add these architecture documents

## filesystem.md

Everything about vaults.

File watching.

Moves.

Deletes.

Renames.

Symbolic links.

Hidden folders.

Ignore rules.

---

## security.md

Extension permissions

Sandboxing

Marketplace signing

Trusted workspaces

Secrets storage

AI provider credentials

---

## performance.md

Startup

Caching

Background indexing

Memory usage

Lazy loading

Rendering

Search indexing

Logging

---

## testing.md

Unit testing

Integration testing

UI testing

End-to-end testing

Performance testing

Extension compatibility testing

---

# Final Open Questions

I'd create one file:

## `003-open-questions.md`

```markdown
# Open Questions

## High Priority

- Should workspaces support multiple root folders?
- How should mobile be supported?
- Should canvases use Markdown references or JSON?
- Should graph data be cached?
- How should encrypted notes work?
- Should notes support custom properties beyond frontmatter?

---

## Medium Priority

- Built-in PDF export?
- Built-in presentation mode?
- Workspace templates?
- Snippet library?
- Scratchpad?

---

## AI

- Built-in prompt library?
- AI memory model?
- Tool permissions?
- Background agents?
- RAG indexing strategy?

---

## Extensions

- Review process?
- Marketplace moderation?
- Signature verification?
- Automatic updates?
- Extension dependency support?

---

## Git

- Git LFS?
- Multiple remotes?
- Built-in GitHub integration?
- Signed commits?
- Git worktrees?

---

## Future

- Collaboration
- CRDT sync
- Mobile apps
- Cloud sync
- Publishing
```

---

# One final file I'd add

I actually think we're missing the single most important file.

```plaintext
plans/000-agent-instructions.md
```

Every coding agent should read this before touching code.

It would contain things like:

```text
Never introduce unnecessary abstractions.

Prefer readability.

Always preserve Markdown compatibility.

Never invent proprietary formats.

Everything must work offline.

Keep memory usage low.

Write tests.

Document public APIs.

Favor composition over inheritance.

Avoid breaking changes.

Keep dependencies minimal.

Follow existing architecture.

When uncertain, ask instead of guessing.

If a design conflicts with these documents,
the design documents win.
```

That one file becomes the "constitution" of the project. Every human and every AI agent starts there, ensuring consistent decisions even as the codebase grows.

## Project Status

At this point, I would consider the planning phase complete. The project now has:

* A clear vision and guiding principles.
* A defined repository layout.
* Core architectural decisions documented.
* A phased roadmap.
* Implementation guidance for each major subsystem.
* Dedicated TODO files for deferred work.
* A consolidated list of open questions.
* A single source of truth for coding agents.

From here, development can proceed incrementally while keeping the architecture coherent, and new contributors—human or AI—can get up to speed quickly by reading the planning documents before writing code.

---

  
  ![image]()
