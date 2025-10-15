# Contributing to System Cleaner

Thank you for your interest in contributing to System Cleaner! This guide will help you get started with development, understand our coding standards, and submit quality contributions.

## Getting Started

### Prerequisites

- Node.js v16.0.0 or higher
- npm v7.0.0 or higher
- Git
- macOS or Windows (for full testing)

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development mode:
   ```bash
   npm run dev
   ```

The application will launch with hot reloading enabled.

## Development Workflow

### Available Commands

```bash
npm run dev          # Start development mode (React + Electron)
npm run build        # Build React app for production
npm start            # Run Electron with built app
npm run package      # Create distributable package
```

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes following our coding standards
3. Test on both macOS and Windows if possible
4. Commit with clear messages
5. Push and create a pull request

## Coding Standards

### Critical Rules

**NO EMOJIS** - Never use emojis in code, UI, or documentation. Use text labels and icons from react-icons instead.

### JavaScript/Node.js

- Use ES6+ features (const/let, arrow functions, async/await)
- 2-space indentation
- Single quotes for strings
- Semicolons at statement ends
- Maximum line length: 100 characters

```javascript
// Good
const scanFiles = async () => {
  try {
    const files = await fs.readdir(path);
    return files.filter(f => f.size > 0);
  } catch (error) {
    console.error('Scan failed:', error);
    throw error;
  }
};
```

### React Components

- Use functional components with hooks only
- Destructure props in function signature
- Use useState and useEffect appropriately
- Keep components focused and single-purpose

```javascript
import { useState, useEffect } from 'react';
import './Component.css';

function Component({ title, onAction }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await onAction();
    setLoading(false);
  };

  return (
    <div className="component">
      <h2>{title}</h2>
      <button onClick={handleClick} disabled={loading}>
        {loading ? 'Processing...' : 'Start'}
      </button>
    </div>
  );
}

export default Component;
```

### CSS Styling

- One CSS file per component
- Use kebab-case for class names
- Follow the design system (colors, spacing, typography)
- Group properties logically (positioning, layout, visual, typography)

```css
.component {
  /* Layout */
  display: flex;
  flex-direction: column;
  gap: 16px;

  /* Box Model */
  padding: 20px;

  /* Visual */
  background: white;
  border: 1px solid #e5e5e7;
  border-radius: 10px;

  /* Typography */
  font-size: 14px;
  color: #1d1d1f;
}
```

## Design System

### Colors

- Primary: #0969DA (GitHub blue)
- Success: #1A7F37 (forest green)
- Warning: #d97706 (amber)
- Error: #ff3b30 (red)
- Text: #1d1d1f (primary), #86868b (secondary)
- Border: #e5e5e7 (default), #d1d1d6 (subtle)

### Spacing Scale (4px-based)

- 4px, 8px, 12px, 16px, 20px, 24px

### Typography

- Desktop-optimized sizing (12-22px)
- System font stack for native feel
- Font weights: 500 (medium), 600 (semibold), 700 (bold)

## Project Structure

```
cleaner/
├── electron/              # Main process (Node.js)
│   ├── main.js           # Entry point, IPC handlers
│   ├── preload.js        # IPC bridge
│   ├── cleaner.js        # System cleaner logic
│   ├── duplicateFinder.js
│   ├── browserCleaner.js
│   └── ...
├── src/                  # Renderer process (React)
│   ├── App.jsx           # Main app, routing
│   ├── components/       # Reusable components
│   ├── pages/           # Page components
│   └── index.css        # Global styles
├── docs/                # Documentation
└── package.json
```

## Adding New Features

### Backend (Electron)

1. Create module in `electron/`
2. Add IPC handlers in `electron/main.js`
3. Expose API in `electron/preload.js`

```javascript
// electron/newFeature.js
async function doSomething() {
  // Implementation
  return result;
}
module.exports = { doSomething };

// electron/main.js
const { doSomething } = require('./newFeature');
ipcMain.handle('new-feature', async () => {
  try {
    const result = await doSomething();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// electron/preload.js
contextBridge.exposeInMainWorld('api', {
  newFeature: () => ipcRenderer.invoke('new-feature')
});
```

### Frontend (React)

1. Create component in `src/components/`
2. Create page in `src/pages/`
3. Add routing in `src/App.jsx`
4. Add navigation in `src/pages/Home.jsx`

## Testing

### Manual Testing Checklist

- Test on both macOS and Windows
- Verify all interactions work
- Check error handling
- Test edge cases
- Ensure accessibility (keyboard navigation, contrast)

### Platform-Specific Testing

**macOS:**
- All features functional
- Safari-specific features
- Permission handling
- Path resolution

**Windows:**
- All features functional
- Driver updater (Windows-only)
- Windows-specific paths
- Process detection

## Pull Request Guidelines

### PR Checklist

- [ ] Code follows style guide
- [ ] No console errors/warnings
- [ ] Tested on target platforms
- [ ] Documentation updated
- [ ] Design system followed
- [ ] Accessibility maintained
- [ ] No emojis used

### PR Description Should Include

- Clear description of changes
- Rationale for changes
- Testing performed
- Screenshots (for UI changes)
- Related issues

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes
- refactor: Code refactoring
- perf: Performance improvements
- test: Adding tests
- chore: Build/tooling changes

**Example:**
```
feat(browser-cleaner): add cookie whitelist support

Implement SQLite-based cookie domain filtering.
Users can now preserve cookies for specific domains
while cleaning browser data.

Closes #123
```

## Error Handling

Always handle errors gracefully:

```javascript
// IPC handlers
ipcMain.handle('operation', async () => {
  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    console.error('Operation failed:', error);
    return { success: false, error: error.message };
  }
});

// React components
const handleAction = async () => {
  setLoading(true);
  try {
    const result = await window.api.operation();
    if (result.success) {
      setData(result.data);
    } else {
      setError(result.error);
    }
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
```

## Accessibility Requirements

- Color contrast minimum 4.5:1 (WCAG AA)
- Touch targets minimum 44x44px
- Keyboard navigation support
- Visible focus states
- Semantic HTML with ARIA labels
- Screen reader compatibility

## Security Guidelines

- Never execute user input
- Validate all file paths
- Sanitize IPC inputs
- Use contextBridge for IPC
- Never disable contextIsolation

## Performance Best Practices

- Use memoization for expensive calculations
- Stream large files instead of loading entirely
- Debounce frequent operations
- Use async/await for non-blocking operations
- Minimize re-renders in React

## Getting Help

- Review documentation in `docs/`
- Check existing issues
- Read [Electron docs](https://www.electronjs.org/docs)
- Read [React docs](https://react.dev)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to System Cleaner!
