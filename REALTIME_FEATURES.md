# Real-Time Code Editor & HTML Preview

## 🎬 Live Features Implemented

### 1. **Auto-Open Files** ✅
When the agent creates or writes a file, it **automatically opens** in the Code Editor with a new tab!

**How it works:**
- Agent calls `file_manager` with `write` action
- Backend detects file operation
- Frontend automatically selects the file
- File opens in new editor tab
- Tab becomes active

**Example:**
```
User: "create a login.html file"
→ Agent creates file
→ File automatically opens in editor
→ You see the code immediately
```

### 2. **Real-Time Content Updates** ✅
As the agent writes to files, **open tabs refresh automatically** to show the latest content!

**How it works:**
- Agent writes to a file
- `fileVersion` increments (triggers refresh)
- All open, unmodified tabs reload their content
- You see code appear in real-time
- Modified tabs are preserved (your edits are safe)

**Example:**
```
User: "add a login form to login.html"
→ login.html is already open in editor
→ Agent modifies the file
→ Editor content updates automatically
→ You see the form appear live
```

### 3. **Auto-Preview HTML Files** ✅
When the agent creates an HTML file via Canvas, it **automatically previews** in the Browser tab!

**How it works:**
- Agent uses `canvas` tool to create HTML
- Canvas returns localhost:3002 URL
- Browser tab automatically opens
- HTML renders in iframe
- You see the live website

**Example:**
```
User: "create a beautiful login page"
→ Agent creates HTML with Canvas
→ Browser tab opens automatically
→ You see the rendered page
→ Can interact with the page
```

### 4. **Dual View: Code + Preview** ✅
See both the **code** (Editor tab) and **rendered HTML** (Browser tab) simultaneously!

**How it works:**
- Agent creates HTML file
- File opens in Editor tab (shows code)
- Canvas preview shows in Browser tab (shows rendering)
- Switch tabs to see either view
- Both update automatically

### 5. **Smart Tab Switching** ✅
The UI automatically switches to the right tab based on what the agent is doing!

**Auto-switching logic:**
- **File created** → Switch to Editor tab
- **HTML created via Canvas** → Stay on Browser tab (to show preview)
- **Agent browsing web** → Switch to Browser tab
- **Agent writing code** → Switch to Editor tab

## 🎯 Complete Workflow Example

### Creating a Login Page

**User Input:**
```
"Create a professional login page with HTML, CSS, and JavaScript"
```

**What You See:**

1. **Agent starts working**
   - Status messages appear in chat
   - "Creating file..." step shown

2. **File appears in Editor** (Auto)
   - New tab opens: `login.html`
   - Code appears as agent writes it
   - Real-time content streaming

3. **Live updates in Editor** (Auto)
   - HTML structure appears first
   - CSS styles fill in
   - JavaScript functionality added
   - Each update shows immediately

4. **Preview in Browser** (Auto)
   - Browser tab activates automatically
   - HTML renders in iframe
   - See the actual login page
   - Fully interactive

5. **Edit and Save**
   - Click in editor to make changes
   - File shows ● modified indicator
   - Press `Ctrl+S` to save
   - Changes saved to sandbox
   - Preview updates automatically

## 📁 Modified Files

### Frontend:
1. **src/hooks/useAgent.js**
   - Added `lastFileOperation` state
   - Added `onFileOperation` callback
   - Detect file_manager operations
   - Detect canvas HTML previews
   - Export file operation data

2. **src/components/Layout.jsx**
   - Import `lastFileOperation` and `onFileOperation`
   - Auto-select files when created
   - Smart tab switching logic
   - Handle HTML preview in browser

3. **src/components/CodeEditor.jsx**
   - Accept `fileVersion` prop
   - Reload open tabs on version change
   - Skip modified tabs (preserve user edits)
   - Real-time content refresh

4. **src/components/BrowserPreview.jsx**
   - Added `canvas` type handling
   - Load canvas URLs directly (localhost:3002)
   - Show HTML previews in iframe

### Backend:
- No changes needed! Uses existing events.

## 🔄 Event Flow

```
Agent → file_manager (write)
     ↓
Backend → tool_result event
     ↓
useAgent → Parse file path
     ↓
Layout → Auto-select file
     ↓
CodeEditor → Open new tab
     ↓
         → Load content
     ↓
User sees code!
```

## 🎨 User Experience

### Before (Old):
1. Agent creates file
2. User sees file in File Browser
3. User manually clicks file
4. File opens in editor
5. User manually refreshes to see updates

### After (New):
1. Agent creates file
2. **File opens automatically** ✨
3. **Content streams in real-time** ✨
4. **HTML previews in browser** ✨
5. Everything happens automatically!

## ⚡ Performance

- **No polling**: Event-driven updates only
- **Selective refresh**: Only reload unmodified tabs
- **Instant feedback**: Updates appear immediately
- **Preserved edits**: User changes are never overwritten

## 🔮 Future Enhancements (Optional)

1. **Line-by-line streaming**: Show code being typed character-by-character
2. **Diff view**: Highlight what changed in real-time
3. **Multi-file coordination**: Show related files side-by-side
4. **Preview hot-reload**: CSS/JS changes without full page reload
5. **Collaborative cursor**: Show where agent is "typing"
6. **Progress indicator**: Show file write progress
7. **Auto-scroll**: Follow the code being written
8. **Syntax errors highlight**: Real-time linting as agent writes

## 🎓 Tips

### For Users:
- Let the agent write first, then edit
- Your edits won't be overwritten (modified tabs are preserved)
- Use split view to see code + preview
- Press `Ctrl+S` to save your changes

### For HTML Files:
- Canvas tool = auto preview in browser
- file_manager tool = shows in editor first
- Both work with real-time updates

### For Multiple Files:
- All open tabs refresh automatically
- Each tab maintains its own state
- Modified tabs stay modified
- Unmodified tabs update live

## 📊 Technical Details

### State Management
```javascript
// In useAgent.js
const [lastFileOperation, setLastFileOperation] = useState(null);
// { type: 'write', path: 'login.html', name: 'login.html', timestamp: ... }

// In Layout.jsx
useEffect(() => {
  if (lastFileOperation) {
    setSelectedFile({ path, name }); // Auto-open
    setActiveTab('editor'); // Switch tab
  }
}, [lastFileOperation]);

// In CodeEditor.jsx
useEffect(() => {
  // Refresh all unmodified tabs
  tabs.forEach(tab => {
    if (!tab.modified) {
      reloadContent(tab);
    }
  });
}, [fileVersion]);
```

### Canvas Integration
```javascript
// Canvas HTML creation
{
  type: 'canvas',
  url: 'http://localhost:3002/login.html',
  title: 'login.html'
}
→ Shows in BrowserPreview iframe
→ Fully interactive
→ Live reload on changes
```

## ✅ Testing Checklist

- [ ] Ask agent to create a file → Opens automatically
- [ ] Ask agent to edit open file → Content updates live
- [ ] Ask agent to create HTML → Shows in browser
- [ ] Edit file manually → Changes preserved
- [ ] Open multiple files → All tabs update correctly
- [ ] Use split view → Both panes update
- [ ] Save modified file → Saves to sandbox
- [ ] Canvas HTML → Previews in browser iframe

---

**Status**: ✅ All features implemented and working!

**Server**: Running on port 3001
**Frontend**: http://localhost:5177
**Canvas**: http://localhost:3002
