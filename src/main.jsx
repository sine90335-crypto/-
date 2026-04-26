import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE || '';
const moods = ['此刻', '疲惫', '期待', '委屈', '勇敢', '想念'];
const minZoom = 0.6;
const maxZoom = 1.5;
const defaultBoard = {
  zoom: 1,
  width: 2200,
  height: 1400,
  hotLimit: 12,
  declutterZoom: 0.78
};

function clampZoom(value) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(value * 100) / 100));
}

function formatTime(value) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function normalizeBoard(board = {}) {
  return {
    ...defaultBoard,
    ...board,
    zoom: clampZoom(board.zoom || defaultBoard.zoom)
  };
}

function noteScore(note) {
  const contentScore = Math.min(String(note.content || '').length, 120);
  const pinScore = note.pinned ? 1000 : 0;
  const updatedAt = new Date(note.updatedAt || note.createdAt || 0).getTime();
  const recencyScore = Number.isFinite(updatedAt) ? updatedAt / 100000000000 : 0;
  return pinScore + contentScore + recencyScore;
}

function App() {
  const boardRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState(moods[0]);
  const [query, setQuery] = useState('');
  const [activeMood, setActiveMood] = useState('全部');
  const [board, setBoard] = useState(defaultBoard);
  const [editingId, setEditingId] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [insight, setInsight] = useState(null);
  const [llmReady, setLlmReady] = useState(false);
  const [llmPanel, setLlmPanel] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${apiBase}/api/notes`)
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.notes || []);
        setInsight(data.insight || null);
        setBoard(normalizeBoard(data.board));
        setLlmReady(Boolean(data.llmReady));
      })
      .catch(() => setError('这面墙暂时没接住你的心事，请确认后端已经启动。'));
  }, []);

  const boardTone = useMemo(() => {
    if (!notes.length) return '还没人把心事交给它';
    if (notes.length < 4) return '它正在听懂你的语气';
    if (notes.length < 8) return '那些反复出现的在发光';
    return '它已经记得你的在意';
  }, [notes.length]);

  const moodOptions = useMemo(() => ['全部', ...new Set(notes.map((note) => note.mood || '此刻'))], [notes]);

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes
      .filter((note) => (activeMood === '全部' ? true : (note.mood || '此刻') === activeMood))
      .filter((note) => (needle ? note.content.toLowerCase().includes(needle) : true))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(a.createdAt) - new Date(b.createdAt));
  }, [activeMood, notes, query]);

  const decluttered = board.zoom <= board.declutterZoom && visibleNotes.length > board.hotLimit;
  const boardNotes = useMemo(() => {
    if (!decluttered) return visibleNotes;
    return [...visibleNotes]
      .sort((a, b) => noteScore(b) - noteScore(a))
      .slice(0, board.hotLimit)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(a.createdAt) - new Date(b.createdAt));
  }, [board.hotLimit, decluttered, visibleNotes]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = boardRef.current;
      if (!el) return;
      const scaledWidth = board.width * board.zoom;
      const scaledHeight = board.height * board.zoom;
      if (scaledWidth > el.clientWidth) el.scrollLeft = (scaledWidth - el.clientWidth) / 2;
      if (scaledHeight > el.clientHeight) el.scrollTop = (scaledHeight - el.clientHeight) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [board.height, board.width, board.zoom]);

  async function submitNote(event) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, mood })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '这张便签没贴上去，再试一次。');
      setNotes((current) => [...current, data.note]);
      setInsight(data.insight);
      setLlmReady(true);
      setContent('');
      setMood(moods[0]);
      setConfirmClear(false);
    } catch (err) {
      setError(err.message || '这张便签没贴上去，再试一次。');
    } finally {
      setLoading(false);
    }
  }

  async function patchNote(id, patch) {
    const original = notes;
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...patch } : note)));
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      setNotes((current) => current.map((note) => (note.id === id ? data.note : note)));
    } catch (err) {
      setNotes(original);
      setError(err.message || '刚才没能更新它，我把便签恢复回来了。');
    }
  }

  async function patchBoard(nextZoom) {
    const zoom = clampZoom(nextZoom);
    const original = board;
    setBoard((current) => ({ ...current, zoom }));
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/board`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoom })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '缩放状态保存失败');
      setBoard(normalizeBoard(data.board));
    } catch (err) {
      setBoard(original);
      setError(err.message || '缩放状态没保存成功，我先恢复原来的比例。');
    }
  }

  async function removeNote(id) {
    const original = notes;
    setNotes((current) => current.filter((note) => note.id !== id));
    setError('');
    try {
      await fetch(`${apiBase}/api/notes/${id}`, { method: 'DELETE' });
    } catch {
      setNotes(original);
      setError('刚才没能放下它，我把这张便签先留回墙上。');
    }
  }

  async function clearNotes() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }

    const original = notes;
    setNotes([]);
    setInsight(null);
    setConfirmClear(false);
    try {
      await fetch(`${apiBase}/api/notes`, { method: 'DELETE' });
    } catch {
      setNotes(original);
      setError('清空失败，我先把这些心事放回来了。');
    }
  }

  async function refreshInsight() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/insight`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'LLM 暂时没有回应。');
      setInsight(data.insight);
      setLlmReady(true);
    } catch {
      setError('需要先配置 LLM API，才能生成回响。');
    } finally {
      setLoading(false);
    }
  }

  async function runLlmTool(type) {
    const endpointMap = {
      summary: '/api/llm/summary',
      connections: '/api/llm/connections',
      prompts: '/api/llm/next-prompts'
    };
    const fallbackTitle = {
      summary: '墙面总结',
      connections: '便签关联',
      prompts: '下一句建议'
    };

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}${endpointMap[type]}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'LLM 暂时没有回应。');
      setLlmReady(true);
      setLlmPanel({ title: fallbackTitle[type], result: data.result });
    } catch (err) {
      setError(err.message || '需要先配置 LLM API，才能使用这个能力。');
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(note) {
    setEditingId(note.id);
    setEditingContent(note.content);
  }

  async function saveEdit(note) {
    const trimmed = editingContent.trim();
    if (!trimmed) {
      setError('便签可以很短，但不能完全空着。');
      return;
    }
    await patchNote(note.id, { content: trimmed });
    setEditingId('');
    setEditingContent('');
  }

  return (
    <main className="appFrame">
      <header className="windowBar">
        <div className="trafficLights" aria-hidden="true">
          <span className="red" />
          <span className="yellow" />
          <span className="green" />
        </div>
        <div className="navControls" aria-hidden="true">
          <span>‹</span>
          <span>›</span>
          <span>▣</span>
        </div>
        <div className="titleBlock">
          <h1>会读心的便签墙</h1>
          <p>把没说出口的话，先放在这里</p>
        </div>
        <div className="toolButtons" aria-hidden="true">
          <span>⌕</span>
          <span>☼</span>
          <span className="avatar">●</span>
        </div>
      </header>

      <div className="shell">
        <section className="workspace">
          <div className="boardControls">
            <div className="stats">
              <span>{notes.length} 张便签</span>
              <span>{boardTone}</span>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索某个反复出现的念头" />
            <div className="zoomControls" aria-label="缩放便签墙">
              <button onClick={() => patchBoard(board.zoom - 0.1)} disabled={board.zoom <= minZoom}>−</button>
              <span>{Math.round(board.zoom * 100)}%</span>
              <button onClick={() => patchBoard(board.zoom + 0.1)} disabled={board.zoom >= maxZoom}>+</button>
              <button onClick={() => patchBoard(1)}>重置</button>
            </div>
            <button className="ghostButton" onClick={clearNotes} disabled={!notes.length}>
              {confirmClear ? '确认清空' : '清空'}
            </button>
          </div>

          <div className="filters">
            {moodOptions.map((item) => (
              <button key={item} className={activeMood === item ? 'active' : ''} onClick={() => setActiveMood(item)}>
                {item}
              </button>
            ))}
          </div>

          <div
            className="board"
            ref={boardRef}
            aria-label="便签墙"
            style={{
              '--board-zoom': board.zoom,
              '--board-width': `${board.width}px`,
              '--board-height': `${board.height}px`
            }}
          >
            {decluttered && (
              <div className="hotHint">缩小视图中，仅展示 {boardNotes.length} 张热门便签</div>
            )}
            <div className="boardContent">
              <div className="boardPlane">
              {notes.length === 0 && (
                <>
                <div className="empty">
                  <span className="heart" aria-hidden="true">♡</span>
                  <strong>这里还没有任何心事</strong>
                  <p>把此刻的心事贴上去</p>
                </div>
                <div className="note sample sun" style={{ left: '70%', top: '18%', transform: 'rotate(4deg)' }}>
                  <p>希望自己<br />能更勇敢一点<br />去追求想要的生活</p>
                  <time>今天 10:24</time>
                </div>
                <div className="note sample sky" style={{ left: '54%', top: '40%', transform: 'rotate(-2deg)' }}>
                  <p>最近有点累，<br />但还想<br />再坚持一下</p>
                  <time>昨天 22:47</time>
                </div>
                <div className="note sample mint" style={{ left: '20%', top: '62%', transform: 'rotate(-3deg)' }}>
                  <p>有一个想法，<br />怕被别人否定，<br />一直没说出来</p>
                  <time>05-20 21:33</time>
                </div>
                <div className="note sample violet" style={{ left: '43%', top: '70%', transform: 'rotate(1deg)' }}>
                  <p>谢谢那个<br />在我低落时<br />陪伴我的朋友</p>
                  <time>05-19 16:08</time>
                </div>
                <div className="note sample rose" style={{ left: '76%', top: '66%', transform: 'rotate(5deg)' }}>
                  <p>和家人之间，<br />有些话<br />不知道怎么开口</p>
                  <time>昨天 18:19</time>
                </div>
                </>
              )}

              {boardNotes.map((note) => (
                <article
                  className={`note ${note.color} ${note.pinned ? 'isPinned' : ''}`}
                  key={note.id}
                  style={{
                    left: `${note.x}%`,
                    top: `${note.y}%`,
                    transform: `rotate(${note.rotate}deg)`
                  }}
                >
                  <div className="noteActions">
                    <button onClick={() => patchNote(note.id, { pinned: !note.pinned })} aria-label="置顶便签">
                      {note.pinned ? '★' : '☆'}
                    </button>
                    <button onClick={() => beginEdit(note)} aria-label="编辑便签">✎</button>
                    <button onClick={() => removeNote(note.id)} aria-label="放下这张便签">×</button>
                  </div>
                  <span className="noteMood">{note.mood || '此刻'}</span>
                  {editingId === note.id ? (
                    <div className="editBox">
                      <textarea value={editingContent} maxLength={240} onChange={(event) => setEditingContent(event.target.value)} />
                      <div>
                        <button onClick={() => saveEdit(note)}>保存</button>
                        <button className="ghostButton" onClick={() => setEditingId('')}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <p>{note.content}</p>
                  )}
                  <time>{formatTime(note.updatedAt || note.createdAt)}</time>
                </article>
              ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="sidepanel">
          <form className="composer" onSubmit={submitNote}>
            <div className="panelHeader">
              <label htmlFor="content">你说，我在听</label>
              <span>▣ 只给你看</span>
            </div>
            <textarea
              id="content"
              value={content}
              maxLength={240}
              onChange={(event) => setContent(event.target.value)}
              placeholder="写下此刻的一句..."
            />
            <div className="composerFooter">
              <select value={mood} onChange={(event) => setMood(event.target.value)} aria-label="选择此刻心情">
                {moods.map((item) => <option key={item}>{item}</option>)}
              </select>
              <span className="counter">{content.length}/240</span>
              <button disabled={loading || !content.trim()}>{loading ? '正在听...' : '贴上去'}</button>
            </div>
          </form>

          {error && <p className="error">{error}</p>}

          <section className="insight">
            <div className="insightHeader">
              <span><b aria-hidden="true">✦</b> 听见回响</span>
              <small>你写下，我回应。</small>
              <button type="button" onClick={refreshInsight} disabled={loading || notes.length === 0}>
                再听一次
              </button>
            </div>

            {insight ? (
              <>
                <p className="mood">{insight.mood}</p>
                <p className="thought">{insight.thought}</p>
                <p className="prompt">{insight.prompt}</p>
                <small>{insight.source === 'llm' ? '由 LLM 读完整面墙后生成' : '先用本地直觉回应你，配置 API Key 后会读得更深'}</small>
              </>
            ) : (
              <div className="insightEmpty">
                <span aria-hidden="true" />
                <p>写下第一句，回响会在这里出现。</p>
              </div>
            )}
            <p className="privacy">◇ 安静保存，只给你看</p>
          </section>

          <section className="aiTools">
            <div className="aiToolsHeader">
              <span>LLM 能力</span>
              <small>{llmReady ? '已连接' : '待配置 API'}</small>
            </div>
            <div className="toolGrid">
              <button type="button" onClick={() => runLlmTool('summary')} disabled={loading || !notes.length}>
                总结墙面
              </button>
              <button type="button" onClick={() => runLlmTool('connections')} disabled={loading || notes.length < 2}>
                找关联
              </button>
              <button type="button" onClick={() => runLlmTool('prompts')} disabled={loading || !notes.length}>
                下一句
              </button>
            </div>
            {llmPanel && (
              <div className="llmResult">
                <strong>{llmPanel.result?.title || llmPanel.title}</strong>
                {llmPanel.result?.summary && <p>{llmPanel.result.summary}</p>}
                {llmPanel.result?.hiddenThread && <p>{llmPanel.result.hiddenThread}</p>}
                {Array.isArray(llmPanel.result?.themes) && llmPanel.result.themes.length > 0 && (
                  <p>{llmPanel.result.themes.join(' / ')}</p>
                )}
                {Array.isArray(llmPanel.result?.prompts) && llmPanel.result.prompts.length > 0 && (
                  <ul>{llmPanel.result.prompts.map((item) => <li key={item}>{item}</li>)}</ul>
                )}
                {llmPanel.result?.reminder && <small>{llmPanel.result.reminder}</small>}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
