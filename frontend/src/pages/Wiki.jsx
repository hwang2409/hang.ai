import { useState, useMemo } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import Layout from '../components/Layout'

const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      {
        id: 'overview',
        title: 'What is Neuronic?',
        content: `Neuronic is an all-in-one study and productivity workspace. It combines note-taking, spaced repetition flashcards, AI chat, a Pomodoro timer, todo management, and more — all in one place.

Everything is designed to help you capture, connect, and retain knowledge. Write notes in markdown, link them together with wiki links, quiz yourself with flashcards, and let AI help you understand difficult concepts.`,
      },
      {
        id: 'creating-notes',
        title: 'Creating Your First Note',
        content: `From the **notes** page, click the **+ new note** button to create a text note. You can also create **canvas** (drawing) and **moodboard** (visual) notes from the same menu.

Notes auto-save as you type — you'll see a small status indicator showing "saved", "saving...", or "unsaved" near the top of the editor.

**Tip:** Use **Cmd+K** (or Ctrl+K) to search notes, and **Cmd+P** (or Ctrl+P) to open the command palette.`,
      },
      {
        id: 'navigation',
        title: 'Navigating the App',
        content: `The sidebar on the left gives you access to every feature:

- **Notes** — your main workspace for writing and organizing
- **Library** — upload and manage PDFs, images, videos, and audio files
- **Dashboard** — see your activity heatmap, study stats, and daily review
- **Chat** — have conversations with AI, with optional web search
- **Flashcards** — create and study flashcards with spaced repetition
- **Feynman** — practice explaining topics in simple terms, or use Socratic mode for AI-driven Q&A
- **Pomodoro** — focus timer with break management
- **Todos** — task list with priorities and due dates
- **Study Plan** — AI-generated study schedules from your syllabus
- **Knowledge Graph** — visual map of how your notes connect

On mobile, tap the hamburger menu (top-left) to open the sidebar.`,
      },
    ],
  },
  {
    id: 'notes',
    title: 'Notes & Editing',
    items: [
      {
        id: 'markdown',
        title: 'Markdown Support',
        content: `Notes are written in markdown. You get full support for:

- **Headers** (# H1, ## H2, ### H3)
- **Bold**, *italic*, ~~strikethrough~~
- Bullet lists and numbered lists
- Code blocks with syntax highlighting
- Tables (GitHub-flavored markdown)
- Math equations with LaTeX ($inline$ and $$block$$)
- Links, images, and blockquotes

Switch between **write** and **read** mode with **Cmd+E** to preview your rendered markdown.`,
      },
      {
        id: 'vim-mode',
        title: 'Vim Mode',
        content: `Toggle Vim mode with **Cmd+J**. This replaces the textarea with a full CodeMirror editor with Vim keybindings.

In Vim mode you get:
- All standard Vim motions (hjkl, w, b, e, %, etc.)
- Visual mode, visual line mode
- Search and replace (/ and :s)
- **:w** to save, **:q** to go back to notes, **:wq** for both
- The status bar shows your current Vim mode (NORMAL, INSERT, VISUAL)

Vim mode is persisted — it stays on across sessions until you toggle it off.`,
      },
      {
        id: 'wiki-links',
        title: 'Wiki Links',
        content: `Link notes together using Obsidian-style wiki links. Type **[[** followed by a note title to create a link.

- **[[Note Title]]** — links to the note with that title
- **[[Note Title|display text]]** — links to "Note Title" but shows "display text"

In Vim mode, typing **[[** triggers autocomplete suggestions showing your existing notes. Select one to auto-insert the full link.

In read mode, wiki links appear as colored clickable text. Click one to navigate directly to that note. Unresolved links (pointing to notes that don't exist) appear dimmed.

Wiki links also automatically create bidirectional links visible in the sidebar's **links** tab.`,
      },
      {
        id: 'annotations',
        title: 'Annotations & Highlighting',
        content: `In **read mode**, select any text to see a floating toolbar. From there you can:

- **Annotate** — add a note attached to that specific text passage
- **Lookup** — ask AI to research, summarize, or define the selected text
- **Chat** — send the selected text to the AI sidebar with a question

Right-click selected text for more options. Your annotations appear in the sidebar's **annotations** tab, where you can edit or delete them.

If the underlying text changes after you annotate it, a "stale" indicator will appear on the annotation.`,
      },
      {
        id: 'tags-folders',
        title: 'Tags & Organization',
        content: `Add tags to any note using the tag input below the title. Type a tag name and press **Enter** to add it. Click the X on a tag to remove it.

On the notes home page, you can organize notes into folders. Use the folder tree in the sidebar to create nested folders and drag notes between them.

Tags are also searchable — use **Cmd+K** to find notes by tag.`,
      },
      {
        id: 'canvas',
        title: 'Canvas Notes',
        content: `Canvas notes give you an infinite whiteboard powered by Excalidraw. Use them for:

- Diagrams and flowcharts
- Mind maps
- Freehand sketches
- Collaborative visual thinking

The floating toolbar at the top lets you edit the title and manage tags. A chat panel is available on the right for AI assistance while you draw.

The toolbar auto-hides after 3 seconds of inactivity — just move your mouse to bring it back.`,
      },
      {
        id: 'moodboard',
        title: 'Moodboard Notes',
        content: `Moodboards are visual notes for collecting images and text in a grid layout. Add images via URL or drag-and-drop, and arrange them with text fields.

You can customize:
- Number of grid columns
- Gap spacing between items
- AI-generated images based on text prompts

Great for design inspiration, visual research, or collecting references.`,
      },
    ],
  },
  {
    id: 'study-tools',
    title: 'Study Tools',
    items: [
      {
        id: 'flashcards',
        title: 'Flashcards & Spaced Repetition',
        content: `Create flashcards with a front (question) and back (answer). Flashcards support full markdown, so you can include code, math, and formatted text.

**AI Generation:** From any note, you can ask the AI chat to generate flashcards from your note content. It will create question-answer pairs based on the key concepts.

**Spaced Repetition:** Flashcards use a spaced repetition algorithm (SM2). When studying, rate each card:
- **1 (Again)** — didn't know it, show again soon
- **2 (Hard)** — got it with difficulty
- **3 (Good)** — knew it
- **4 (Easy)** — knew it instantly

The algorithm adjusts review intervals based on your performance. Cards you struggle with appear more frequently.

**Interleaved Practice:** By default, due cards are shuffled across topics (interleaved) rather than grouped by note. Research shows interleaving improves long-term retention. You can toggle this with the shuffle icon in the study header.

**Stats:** The flashcards page shows your total cards, cards due today, mastered cards, and weak spots (cards with low ease scores).

**Keyboard shortcuts in study mode:** Space to flip, 1-4 to rate.`,
      },
      {
        id: 'feynman',
        title: 'Feynman Technique',
        content: `The Feynman technique is a learning method where you explain a concept in simple terms, as if teaching it to someone else. If you can't explain it simply, you don't understand it well enough.

In the Feynman page:
1. Choose a topic (optionally link a note for context)
2. Write your explanation in plain language
3. Submit for AI evaluation

The AI scores your explanation (0-100) and gives detailed feedback on clarity, accuracy, and completeness. Your history of sessions is saved so you can track improvement over time.`,
      },
      {
        id: 'socratic',
        title: 'Socratic Dialogue',
        content: `Socratic mode flips the Feynman approach — instead of you explaining, the **AI asks you questions** to probe your understanding.

How it works:
1. Go to the **Feynman** page and switch to the **socratic** tab
2. Enter a topic (optionally select a reference note)
3. Click **start dialogue** — the AI asks its first probing question
4. Type your answer and press **Enter** (or click send)
5. The AI adapts its questions based on your answers, probing weak areas
6. After 5-10 exchanges, the AI evaluates your understanding with a score, strengths, weaknesses, and feedback

You can end the session early by clicking the **stop** button (square icon). The AI will evaluate based on the answers you've given so far.

All socratic sessions appear in the **history** tab alongside regular Feynman sessions, marked with a chat icon.

**Tip:** Socratic mode is more rigorous than Feynman — the AI will find gaps you didn't know you had. Use it before exams for topics you think you already know.`,
      },
      {
        id: 'practice-problems',
        title: 'Practice Problems',
        content: `The **practice** tab in the Feynman page generates open-ended problems for any topic with step-by-step feedback.

How it works:
1. Go to **Feynman** > **practice** tab
2. Enter a topic and choose a difficulty (easy, medium, hard)
3. Optionally select a reference note for context
4. Click **generate problem** — the AI creates a problem with hints and a solution
5. Work through the problem and write your answer
6. Click **check answer** — the AI evaluates your solution, scores it, and identifies missed steps

**Hints:** Click "show hint" for progressive hints (2-3 per problem) if you're stuck. Hints are revealed one at a time.

**Solution:** You can reveal the full solution and answer at any time by clicking "show solution". This is available both before and after checking your answer.

**Tip:** Use practice problems to prepare for exams. They go beyond quizzes by requiring you to show your work, not just pick an answer.`,
      },
      {
        id: 'study-plan',
        title: 'Study Plans',
        content: `Paste your syllabus or list of topics, set an exam date, and the AI generates a structured study plan with a timeline.

Each plan has checkable items you can mark off as you study. The plan is saved and you can return to it anytime from the study plan page.

Create multiple plans for different subjects or exams.`,
      },
      {
        id: 'quizzes',
        title: 'Quizzes & Exam Mode',
        content: `Generate quizzes from your notes with multiple choice, true/false, and fill-in-the-blank questions.

**Standard mode:** After each question, you get immediate feedback showing whether you were correct, the right answer, and an explanation.

**Exam simulation mode:** Click the **exam** button (shield icon) next to any quiz to take it in exam mode. In exam mode:
- No feedback is shown after each question
- Questions auto-advance when you answer
- You see all results only after completing the entire quiz
- A full review shows every question with your answer and the correct answer
- Timer runs throughout for realistic exam conditions

**Keyboard shortcuts:** 1-4 for multiple choice, T/F for true/false, Enter to submit fill-in-the-blank, Enter/Space to advance (standard mode).

**Tip:** Take a quiz in standard mode first to learn the material, then retake it in exam mode to simulate real test conditions.`,
      },
      {
        id: 'study-guide',
        title: 'Study Guide Compilation',
        content: `Select multiple notes and compile them into a single study guide using AI.

How it works:
1. On the **notes** page, click the **book** icon in the header to enter select mode
2. Click notes to select them (golden border shows selection)
3. Click **compile guide** — the AI merges and organizes the content into a comprehensive study guide
4. A new note is created with the compiled guide, which you can then edit

The AI eliminates redundancy, organizes by topic, includes key definitions and formulas, and adds a summary section at the top. Select 2-10 notes at a time.`,
      },
    ],
  },
  {
    id: 'ai-features',
    title: 'AI Features',
    items: [
      {
        id: 'chat',
        title: 'AI Chat',
        content: `The standalone **chat** page lets you have open-ended conversations with AI. It supports:

- **Web search** — the AI can search the web and cite sources in its responses
- **Conversation threads** — start new threads or continue previous ones
- Full markdown rendering in responses

From within a note, the sidebar chat is context-aware — it knows about the note you're currently editing and can help you refine, expand, or restructure your content.`,
      },
      {
        id: 'note-ai',
        title: 'AI in Notes',
        content: `When editing a note, open the sidebar (chat icon in the top toolbar) to access the AI assistant. It can:

- **Edit your note** — ask it to rewrite, expand, or restructure sections
- **Answer questions** — about the note content or related topics
- **Generate flashcards** — from the note's content
- **Lookup** — select text in read mode and use "research", "summarize", or "define" actions

The AI sees your full note content, so you can reference specific sections in your questions.`,
      },
    ],
  },
  {
    id: 'productivity',
    title: 'Productivity',
    items: [
      {
        id: 'pomodoro',
        title: 'Pomodoro Timer',
        content: `A classic Pomodoro timer with three modes:

- **Focus** — 25 minutes of concentrated work
- **Short Break** — 5 minutes
- **Long Break** — 15 minutes

Add an optional label to each focus session (e.g., "Chapter 3 review"). An audio chime plays when the timer completes.

The stats section shows:
- A **90-day heatmap** of your focus sessions
- **Weekly chart** of focus minutes
- **Recent activity** feed with session history
- Total focus time and session count`,
      },
      {
        id: 'todos',
        title: 'Todos',
        content: `A straightforward task manager with:

- **Priorities** — none, low, medium, high (color-coded)
- **Due dates** — with a calendar date picker
- **Completion toggle** — check off tasks as you finish them
- **Sorting** — by recent, due date, or priority
- **Calendar view** — see todos plotted on a monthly calendar

Create todos for study tasks, assignments, or anything else you need to track.`,
      },
      {
        id: 'dashboard',
        title: 'Dashboard',
        content: `Your activity overview showing:

- **Daily brief** — AI-generated action plan: what to study next, overdue tasks, weak topics
- **365-day heatmap** — visualize your daily study consistency
- **Pomodoro stats** — today's focus time, weekly total, streak, and all-time hours
- **Flashcard progress** — cards due, mastered, and learning
- **Topic mastery** — per-topic mastery bars aggregated from flashcard ease, quiz scores, and Feynman evaluations. Color-coded: green (70%+), gold (40-70%), red (below 40%)
- **Performance trends** — weekly quiz accuracy, flashcard retention, and study minutes
- **Study time analytics** — 12-week bar chart of weekly study hours with trend indicator (increasing/decreasing/stable), average hours per week, and best week
- **Weekly focus chart** — Pomodoro minutes per day for the current week
- **Pending todos** — upcoming tasks at a glance
- **Recent activity** — latest Pomodoro sessions and note edits

Check your dashboard regularly to stay on top of your study habits.`,
      },
    ],
  },
  {
    id: 'library-files',
    title: 'Library & Files',
    items: [
      {
        id: 'library',
        title: 'Document Library',
        content: `Upload files to your library for reference alongside your notes:

- **PDFs** — viewed in an embedded PDF reader with page annotations
- **Images** — full-screen image viewer
- **Videos** — built-in video player with timestamp annotations
- **Audio** — audio playback with timestamp annotations and transcription
- **PowerPoints** — PPTX file support

Upload via drag-and-drop or the file picker. You can also add URLs as link references.

Filter your library by file type using the tabs at the top.`,
      },
      {
        id: 'voice-recording',
        title: 'Voice Recording',
        content: `Record audio directly in the app — perfect for capturing lectures or verbal notes.

1. In the **Library**, click the **microphone** button next to the upload button
2. Grant microphone permission when prompted
3. A recording overlay appears with a live timer and pulsing indicator
4. Click **stop** to finish, or **cancel** to discard
5. The recording is automatically uploaded to your library

If you have an OpenAI API key configured, recordings are **automatically transcribed** using Whisper. The transcript appears below the audio player and can be converted to a note.

For pre-existing audio files, click **transcribe audio** in the file viewer to trigger transcription manually.`,
      },
      {
        id: 'sharing',
        title: 'Note Sharing',
        content: `Share any note via a public read-only link:

1. Open the note you want to share
2. Click the **share** icon in the toolbar (top-right area)
3. Click **copy share link** — a unique URL is copied to your clipboard
4. Anyone with the link can view the note (no login required)

To stop sharing, click the share icon again and select **stop sharing**. The link will immediately stop working.

Shared notes display the full rendered markdown including math, code, and tables — but viewers cannot edit.`,
      },
    ],
  },
  {
    id: 'export',
    title: 'Export & Sharing',
    items: [
      {
        id: 'pdf-export',
        title: 'PDF Export',
        content: `Export any note as a PDF:

1. Open the note
2. Click the **download** icon in the toolbar
3. A styled PDF is generated and downloaded

The PDF includes rendered markdown, code blocks, tables, and **LaTeX math** (rendered as high-quality images). Great for printing study guides or submitting formatted notes.`,
      },
      {
        id: 'anki-export',
        title: 'Anki Deck Export',
        content: `Export your flashcards as an Anki-compatible deck (.apkg file):

1. Go to the **Flashcards** page
2. Click the **export** button
3. An .apkg file downloads containing all your cards

Import it directly into Anki to study on mobile or sync across devices. Cards include full markdown formatting.`,
      },
      {
        id: 'note-sharing',
        title: 'Public Sharing',
        content: `Share any note via a public read-only link. Click the **share** icon in the note toolbar to generate a link. Anyone with the link can view the rendered note without logging in.

Stop sharing at any time from the same menu — the link immediately stops working.`,
      },
    ],
  },
  {
    id: 'connections',
    title: 'Connecting Knowledge',
    items: [
      {
        id: 'linking',
        title: 'Bidirectional Links',
        content: `Notes can be linked together in two ways:

1. **Wiki links** — type [[Note Title]] in your note content
2. **Sidebar links** — use the links tab in the note sidebar to search and add links manually

Both methods create bidirectional connections. If Note A links to Note B, then Note B's links tab will also show Note A.

Links created via wiki links in your content are automatically synced to the sidebar links tab when you save.`,
      },
      {
        id: 'smart-connections',
        title: 'Smart Connections',
        content: `Neuronic automatically suggests related notes based on semantic similarity. Open any note's sidebar **links** tab to see:

- **Explicit links** — notes you've manually linked or connected via wiki links
- **Suggested connections** — AI-detected notes with similar content

Suggestions show a similarity percentage and a **+ link** button. Click it to convert a suggestion into an explicit link.

This is powered by the same embedding model used for semantic search. The more notes you write, the better the suggestions become.

**Tip:** Check suggested connections after writing new notes — you'll often find relevant connections you didn't think of.`,
      },
      {
        id: 'knowledge-graph',
        title: 'Knowledge Graph',
        content: `The knowledge graph is an interactive visualization of how all your notes connect. Each note is a node, and each link between notes is an edge.

- **Click a node** to navigate to that note
- **Drag nodes** to rearrange the layout
- **Zoom and pan** to explore large graphs
- **Search** to highlight specific nodes
- Nodes are color-coded by folder

The graph uses a force-directed layout that naturally clusters related notes together. The more you link your notes, the richer and more useful this visualization becomes.`,
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    items: [
      {
        id: 'global-shortcuts',
        title: 'Global Shortcuts',
        content: `These work anywhere in the app:

| Shortcut | Action |
|----------|--------|
| **Cmd+K** | Search notes |
| **Cmd+P** | Command palette |
| **Esc** | Close modals and search |`,
      },
      {
        id: 'note-shortcuts',
        title: 'Note Editor Shortcuts',
        content: `These work when editing a note:

| Shortcut | Action |
|----------|--------|
| **Cmd+E** | Toggle write/read mode |
| **Cmd+J** | Toggle Vim mode |
| **Cmd+Enter** | Save annotation (when editing) |

**Vim mode shortcuts:**

| Command | Action |
|---------|--------|
| **:w** | Save note |
| **:q** | Go back to notes |
| **:wq** | Save and go back |
| **[[** | Open wiki link autocomplete |`,
      },
      {
        id: 'flashcard-shortcuts',
        title: 'Flashcard Study Shortcuts',
        content: `During flashcard study sessions:

| Shortcut | Action |
|----------|--------|
| **Space** | Flip card |
| **1** | Rate: Again |
| **2** | Rate: Hard |
| **3** | Rate: Good |
| **4** | Rate: Easy |`,
      },
    ],
  },
  {
    id: 'workflow',
    title: 'Daily Workflow',
    items: [
      {
        id: 'morning',
        title: 'Morning Routine',
        content: `Start your study session with this routine:

1. **Check your dashboard** — see your activity streak and what's due today
2. **Review flashcards** — study any cards that are due for spaced repetition
3. **Check todos** — review upcoming tasks and deadlines
4. **Start a Pomodoro** — begin a focused study session

This takes about 15-20 minutes and sets you up for a productive day.`,
      },
      {
        id: 'study-session',
        title: 'During a Study Session',
        content: `While actively studying:

1. **Start a Pomodoro timer** with a label for what you're working on
2. **Take notes** in markdown as you read or watch lectures
3. **Use wiki links** ([[topic]]) to connect related concepts across notes
4. **Annotate** key passages in read mode for later review
5. **Ask the AI** sidebar when you're stuck on a concept
6. **Generate flashcards** from your notes for the concepts you want to memorize

After each Pomodoro, take your break and then review what you just learned.`,
      },
      {
        id: 'review',
        title: 'Weekly Review',
        content: `At the end of each week:

1. **Dashboard** — check your weekly focus chart and heatmap
2. **Feynman practice** — pick 2-3 concepts and try to explain them
3. **Knowledge graph** — explore how your notes connect, look for isolated nodes that should be linked
4. **Study plan** — update progress on your study plans
5. **Flashcard weak spots** — focus extra time on cards with low ease scores

Regular review is what turns short-term learning into long-term knowledge.`,
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips & Best Practices',
    items: [
      {
        id: 'note-tips',
        title: 'Note-Taking Tips',
        content: `- **Use headers generously** — they make notes scannable and help the AI understand structure
- **One concept per note** — keep notes focused; link related concepts with wiki links
- **Write in your own words** — don't just copy-paste; rephrase to aid understanding
- **Use LaTeX for math** — $E = mc^2$ renders beautifully in read mode
- **Tag consistently** — use a small set of meaningful tags (e.g., "calculus", "midterm-prep")`,
      },
      {
        id: 'flashcard-tips',
        title: 'Flashcard Tips',
        content: `- **Keep cards atomic** — one question, one answer
- **Use AI generation** then edit — faster than writing from scratch
- **Don't skip "Again"** — honest ratings lead to better scheduling
- **Study daily** — even 5 minutes of spaced repetition compounds over time
- **Review weak spots weekly** — the flashcards page shows which cards need extra attention`,
      },
      {
        id: 'productivity-tips',
        title: 'Productivity Tips',
        content: `- **Pomodoro labels** — always label your sessions so the dashboard is meaningful
- **Morning flashcards** — review due cards first thing; it only takes a few minutes
- **Wiki link everything** — the more connections you make, the richer your knowledge graph
- **Use the Feynman technique** on topics before exams — it reveals gaps in understanding
- **Check your heatmap** — maintaining streaks is motivating and builds consistency`,
      },
    ],
  },
]

export default function Wiki() {
  const [activeSection, setActiveSection] = useState('getting-started')
  const [activeItem, setActiveItem] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')

  const currentSection = sections.find(s => s.id === activeSection)
  const currentItem = currentSection?.items.find(i => i.id === activeItem)

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections
    const q = searchQuery.toLowerCase()
    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(
          item =>
            item.title.toLowerCase().includes(q) ||
            item.content.toLowerCase().includes(q)
        ),
      }))
      .filter(section => section.items.length > 0)
  }, [searchQuery])

  const handleItemClick = (sectionId, itemId) => {
    setActiveSection(sectionId)
    setActiveItem(itemId)
  }

  return (
    <Layout>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar TOC */}
        <div className="w-64 flex-shrink-0 border-r border-[#1c1c1c] bg-[#0e0e0e] overflow-y-auto hidden md:flex flex-col">
          <div className="px-4 py-5 border-b border-[#1c1c1c]">
            <h1 className="text-sm font-semibold text-[#d4d4d4] tracking-tight mb-3">wiki</h1>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#333333]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search docs..."
                className="w-full bg-[#111111] border border-[#1c1c1c] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors"
              />
            </div>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-1">
            {filteredSections.map(section => (
              <div key={section.id} className="mb-2">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-[#404040] font-medium">
                  {section.title}
                </div>
                {section.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(section.id, item.id)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                      activeSection === section.id && activeItem === item.id
                        ? 'bg-[#191919] text-[#d4d4d4]'
                        : 'text-[#606060] hover:text-[#808080] hover:bg-[#141414]'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {/* Mobile section selector */}
          <div className="md:hidden px-4 pt-4 pb-2 flex gap-2 overflow-x-auto">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => { setActiveSection(s.id); setActiveItem(s.items[0]?.id) }}
                className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  activeSection === s.id
                    ? 'border-[#333333] text-[#d4d4d4] bg-[#191919]'
                    : 'border-[#1c1c1c] text-[#606060]'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          {currentItem ? (
            <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 text-xs text-[#404040] mb-6">
                <span>{currentSection?.title}</span>
                <ChevronRight size={11} />
                <span className="text-[#606060]">{currentItem.title}</span>
              </div>

              <h2 className="text-xl font-semibold text-[#e8e8e8] tracking-tight mb-6">
                {currentItem.title}
              </h2>

              <div className="wiki-content prose max-w-none">
                {currentItem.content.split('\n\n').map((block, i) => {
                  // Table blocks
                  if (block.trim().startsWith('|')) {
                    const rows = block.trim().split('\n').filter(r => !r.match(/^\|\s*[-:]+/))
                    const headers = rows[0]?.split('|').filter(Boolean).map(c => c.trim())
                    const body = rows.slice(1).map(r => r.split('|').filter(Boolean).map(c => c.trim()))
                    return (
                      <table key={i} className="mb-4">
                        <thead>
                          <tr>
                            {headers?.map((h, j) => (
                              <th key={j} dangerouslySetInnerHTML={{ __html: formatInline(h) }} />
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {body.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td key={ci} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }

                  // List blocks
                  if (block.match(/^[-*]\s/m)) {
                    const items = block.split('\n').filter(l => l.match(/^[-*]\s/))
                    return (
                      <ul key={i} className="mb-4">
                        {items.map((item, j) => (
                          <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item.replace(/^[-*]\s/, '')) }} />
                        ))}
                      </ul>
                    )
                  }

                  // Numbered list blocks
                  if (block.match(/^\d+\.\s/m)) {
                    const items = block.split('\n').filter(l => l.match(/^\d+\.\s/))
                    return (
                      <ol key={i} className="mb-4">
                        {items.map((item, j) => (
                          <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item.replace(/^\d+\.\s/, '')) }} />
                        ))}
                      </ol>
                    )
                  }

                  // Paragraph
                  return (
                    <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(block.replace(/\n/g, ' ')) }} />
                  )
                })}
              </div>

              {/* Nav between items in same section */}
              <div className="flex justify-between items-center mt-12 pt-6 border-t border-[#1c1c1c]">
                {(() => {
                  const idx = currentSection?.items.findIndex(i => i.id === activeItem)
                  const prev = idx > 0 ? currentSection.items[idx - 1] : null
                  const next = idx < (currentSection?.items.length || 0) - 1 ? currentSection.items[idx + 1] : null
                  return (
                    <>
                      {prev ? (
                        <button
                          onClick={() => setActiveItem(prev.id)}
                          className="text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors"
                        >
                          &larr; {prev.title}
                        </button>
                      ) : <div />}
                      {next ? (
                        <button
                          onClick={() => setActiveItem(next.id)}
                          className="text-xs text-[#606060] hover:text-[#d4d4d4] transition-colors"
                        >
                          {next.title} &rarr;
                        </button>
                      ) : <div />}
                    </>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[#333333] text-sm">
              select a topic from the sidebar
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

/** Format inline markdown: **bold**, *italic*, `code`, [[wiki]] */
function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="wiki-ref">$1</span>')
}
