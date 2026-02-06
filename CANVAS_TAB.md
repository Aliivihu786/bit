# Canvas Tab - HTML Preview

## 🎨 New Feature: Dedicated Canvas Tab

Your Bit Agent now has **three separate tabs** for different purposes:

### 📑 **Tab Structure:**

1. **🌐 Browser Tab**
   - For external websites
   - Web search results
   - web_browser tool navigation
   - External URL previews

2. **🎨 Canvas Tab** (NEW!)
   - For HTML files created by agent
   - Canvas tool previews
   - localhost:3002 rendering
   - Interactive HTML/CSS/JS

3. **💻 Editor Tab**
   - Code viewing/editing
   - Multiple file tabs
   - Syntax highlighting
   - Save with Ctrl+S

## ✨ How It Works

### Agent Creates HTML:
```
You: "Create a beautiful login page"

Agent: Uses canvas tool
     ↓
Canvas Tab: Opens automatically
     ↓
Shows: Live HTML preview at localhost:3002
     ↓
Editor Tab: Also has the code (can switch back)
```

### Auto-Switching Logic:
- **Canvas tool used** → Switch to Canvas tab
- **HTML rendered** → Show in Canvas iframe
- **Can manually switch** → Click any tab
- **Code always available** → Switch to Editor tab

## 🎯 Canvas Preview Features

### Toolbar:
- **Title** - Shows HTML filename
- **Refresh** - Reload the canvas
- **Open External** - Open in new browser tab

### Preview Area:
- **Full iframe** - Complete HTML rendering
- **Sandboxed** - Safe execution
- **Interactive** - Forms, buttons, JavaScript work
- **Responsive** - See actual layout

### Info Bar:
- **URL** - Shows localhost:3002/filename
- **Status** - Loading / Ready indicator

## 📂 Files Created

### New Files:
- [src/components/CanvasPreview.jsx](src/components/CanvasPreview.jsx) - Canvas preview component (90 lines)

### Modified Files:
- [src/components/Layout.jsx](src/components/Layout.jsx)
  - Added Canvas tab button
  - Added CanvasPreview rendering
  - Auto-switch to Canvas on HTML create

- [src/App.css](src/App.css)
  - Added 150+ lines of Canvas styles
  - Toolbar, frame, loading states
  - Info bar and empty state

## 🎬 User Experience

### Before (2 Tabs):
```
Browser Tab:
  - External websites + HTML previews (mixed)

Editor Tab:
  - Code editing
```

### After (3 Tabs):
```
Browser Tab:
  - 🌐 Only external websites
  - Web search results
  - Clean separation

Canvas Tab:
  - 🎨 Only agent-created HTML
  - localhost:3002 previews
  - Dedicated HTML workspace

Editor Tab:
  - 💻 Only code editing
  - Multiple files
  - Syntax highlighting
```

## 🔄 Complete Workflow

### Creating and Previewing HTML:

**Step 1: User Request**
```
"Create a professional login page with HTML and CSS"
```

**Step 2: Agent Creates**
- Agent uses canvas tool
- HTML file created
- Canvas server (localhost:3002) serves it

**Step 3: Auto-Open in Canvas** ✨
- Canvas tab opens automatically
- HTML renders in iframe
- See the actual login page

**Step 4: View Code** ✨
- Click Editor tab
- See the source code
- Edit if needed

**Step 5: Switch Back** ✨
- Click Canvas tab
- See rendered output
- Test interactivity

## 💡 Use Cases

### 1. **Quick Prototypes**
```
"Create a landing page"
→ Canvas shows the design
→ Editor shows the code
→ Iterate quickly
```

### 2. **Component Previews**
```
"Create a button component"
→ Canvas shows the button
→ Test hover/click states
→ See live styling
```

### 3. **Full Pages**
```
"Create a dashboard"
→ Canvas shows complete layout
→ Responsive preview
→ Interactive elements work
```

### 4. **Form Testing**
```
"Create a signup form"
→ Canvas shows the form
→ Can actually type in inputs
→ Test validation
```

## 🎨 Canvas vs Browser

| Feature | Browser Tab | Canvas Tab |
|---------|------------|------------|
| Purpose | External web | Agent HTML |
| Source | Internet URLs | localhost:3002 |
| Content | Any website | HTML/CSS/JS only |
| Proxy | Yes (for CORS) | No (direct) |
| Navigation | Full browsing | Single page |
| Auto-open | Web searches | Canvas tool |

## 🚀 Technical Details

### Component Structure:
```jsx
<CanvasPreview>
  ├── Canvas Toolbar
  │   ├── Title + Icon
  │   ├── Refresh Button
  │   └── External Link Button
  ├── Canvas Frame Container
  │   ├── Loading Overlay
  │   └── Iframe (sandboxed)
  └── Canvas Info Bar
      ├── URL Display
      └── Status Indicator
</CanvasPreview>
```

### State Management:
```javascript
// In useAgent.js
if (event.tool === 'canvas' && result.created) {
  setBrowserState({
    type: 'canvas',
    url: result.url,
    title: result.name,
  });
}

// In Layout.jsx
if (browserState.type === 'canvas') {
  setActiveTab('canvas'); // Auto-switch
}
```

### Iframe Sandbox:
```html
<iframe
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
  src="http://localhost:3002/login.html"
/>
```

## 📊 Benefits

### For Users:
- ✅ **Cleaner organization** - Each tab has clear purpose
- ✅ **Faster workflow** - No switching between external sites and HTML
- ✅ **Better preview** - Dedicated space for agent HTML
- ✅ **Live interaction** - Test forms, buttons, JavaScript
- ✅ **Side-by-side** - Can see code + preview easily

### For Development:
- ✅ **Separation of concerns** - Each component focused
- ✅ **Easier debugging** - Know which tab shows what
- ✅ **Cleaner code** - BrowserPreview no longer mixed
- ✅ **Extensibility** - Easy to add more canvas features

## 🎯 Quick Reference

### Keyboard Shortcuts:
- No specific shortcuts yet
- Click tabs to switch
- `Ctrl+S` still saves in Editor

### Tab Indicators:
- 🟢 **Pulse animation** on active tool
- Canvas tab pulses when canvas tool runs
- Browser tab pulses when browsing
- Editor tab always available

### Empty States:
- **Browser**: "Start browsing..." message
- **Canvas**: "No Canvas Preview" with monitor icon
- **Editor**: "No files open" with file icon

## 🔮 Future Enhancements (Optional)

1. **Canvas Hot-Reload**
   - Auto-refresh when agent updates HTML
   - No manual refresh needed

2. **Responsive Preview**
   - Mobile/tablet/desktop views
   - Toggle between device sizes

3. **Canvas Inspector**
   - View DOM structure
   - CSS inspection
   - Console logs

4. **Multi-Canvas**
   - Multiple HTML files open
   - Tab-like interface in Canvas
   - Compare versions

5. **Canvas Download**
   - Download HTML as file
   - Export complete project
   - Share preview link

---

## ✅ Summary

**Status**: ✅ Canvas Tab fully implemented!

**What Changed**:
- 3 tabs instead of 2
- Dedicated HTML preview space
- Auto-switching on canvas tool
- Clean separation of concerns

**Try It Now**:
```
"Create a beautiful landing page with hero section"
→ Watch Canvas tab open automatically
→ See your HTML come to life
→ Switch to Editor to see code
→ Switch back to Canvas to test it
```

**Server**: Running on port 3001 ✅
**Frontend**: http://localhost:5177
**Canvas**: http://localhost:3002
