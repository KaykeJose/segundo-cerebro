import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { Search, Plus, Network, FileText, Trash2, Tag, X, Menu } from 'lucide-react';

// ---------- Supabase via API REST direta (mesmo padrão já usado no Make) ----------
const SUPABASE_URL = 'https://trddqvqbtvvwjqlgswwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EHe9qhOcTVytZSNDzKB_nw_5qlCNq4v';

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function sbSelectNotas() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notas?select=id,titulo,conteudo,origem,tags,criado_em,atualizado_em&order=criado_em.asc`,
    { headers: sbHeaders }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
  return res.json();
}

async function sbInsertNota(note) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify([
      { id: note.id, titulo: note.title, conteudo: note.content, origem: 'artifact' },
    ]),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbUpdateNota(note) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas?id=eq.${encodeURIComponent(note.id)}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      titulo: note.title,
      conteudo: note.content,
      atualizado_em: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbDeleteNota(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbDeleteLinksFromOrigem(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_links?nota_origem_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbInsertLinks(rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_links`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbBuscar(query) {
  const q = encodeURIComponent(query.trim());
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notas?select=id,titulo,conteudo,origem,tags,criado_em&busca=wfts(portuguese).${q}&order=criado_em.desc&limit=25`,
    { headers: sbHeaders }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
  return res.json();
}

async function sbPerguntar(pergunta, modelo) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/perguntar`, {
    method: 'POST',
    headers: { ...sbHeaders },
    body: JSON.stringify({ pergunta, modelo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status} ao perguntar`);
  }
  return data;
}

function rowToNote(row) {
  return {
    id: row.id,
    title: row.titulo || '',
    content: row.conteudo || '',
    origem: row.origem || null,
    tags: row.tags || [],
    createdAt: row.criado_em ? new Date(row.criado_em).getTime() : Date.now(),
    updatedAt: row.atualizado_em ? new Date(row.atualizado_em).getTime() : Date.now(),
  };
}

// ---------- Helpers ----------
const uid = () =>
  (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

function extractLinks(content) {
  const re = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let m;
  while ((m = re.exec(content)) !== null) links.push(m[1].trim());
  return [...new Set(links)];
}

function extractTags(content) {
  const re = /#([a-zA-Z0-9_\-À-ÿ]+)/g;
  const tags = [];
  let m;
  while ((m = re.exec(content)) !== null) tags.push(m[1]);
  return [...new Set(tags)];
}

function renderMarkdownLite(content) {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    let html = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link" data-link="$1">[[$1]]</span>');
    html = html.replace(/#([a-zA-Z0-9_\-À-ÿ]+)/g, '<span class="tag-chip">#$1</span>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    if (/^###\s/.test(line)) return { type: 'h3', html: html.replace(/^###\s/, ''), key: i };
    if (/^##\s/.test(line)) return { type: 'h2', html: html.replace(/^##\s/, ''), key: i };
    if (/^#\s/.test(line)) return { type: 'h1', html: html.replace(/^#\s/, ''), key: i };
    if (/^-\s/.test(line)) return { type: 'li', html: html.replace(/^-\s/, ''), key: i };
    if (line.trim() === '') return { type: 'br', html: '', key: i };
    return { type: 'p', html, key: i };
  });
}

const SEED_NOTES = [
  {
    id: 'welcome',
    title: 'Bem-vindo ao Segundo Cérebro',
    content:
      '# Bem-vindo\n\nEsse é o seu sistema de notas conectadas, no estilo do [[Obsidian]].\n\n- Use [[Nome da Nota]] para linkar notas entre si\n- Use #tags para categorizar\n- Veja tudo se conectando no modo **Grafo**\n\nComece criando notas sobre seus projetos, como [[Agência de Marketing]] e [[GTA 6 Radar]].',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'obsidian',
    title: 'Obsidian',
    content:
      'O Obsidian é a inspiração deste sistema. Ele conecta notas em um grafo visual, criando um "segundo cérebro". #referencia',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'agencia',
    title: 'Agência de Marketing',
    content:
      'Notas e planejamentos da agência. Relacionado a [[Prospecção Ativa]] e clientes como Arena BRB. #trabalho',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'prospeccao',
    title: 'Prospecção Ativa',
    content: 'Skill de prospecção B2B usada na [[Agência de Marketing]]. #skill #trabalho',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'gta6',
    title: 'GTA 6 Radar',
    content: 'Projeto de conteúdo sobre GTA 6. Ideias, roteiros e pautas. #trabalho #conteudo',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ---------- D3 Graph Component ----------
function GraphView({ notes, selectedId, onSelect }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const titleToId = {};
    notes.forEach((n) => (titleToId[n.title.toLowerCase()] = n.id));

    const nodes = notes.map((n) => ({ id: n.id, title: n.title }));
    const links = [];
    notes.forEach((n) => {
      extractLinks(n.content).forEach((linkTitle) => {
        const targetId = titleToId[linkTitle.toLowerCase()];
        if (targetId && targetId !== n.id) {
          links.push({ source: n.id, target: targetId });
        }
      });
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g');

    // zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#4a5266');

    const linkSel = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#4a5266')
      .attr('stroke-width', 1.4)
      .attr('marker-end', 'url(#arrow)');

    const nodeSel = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => onSelect(d.id));

    const nodeRadiusPre = width < 420 ? 6 : 8;
    nodeSel
      .append('circle')
      .attr('r', nodeRadiusPre)
      .attr('fill', (d) => (d.id === selectedId ? '#e8a05c' : '#2a3040'))
      .attr('stroke', (d) => (d.id === selectedId ? '#f4b877' : '#4a5266'))
      .attr('stroke-width', 1.5);

    const maxChars = width < 420 ? 12 : 22;
    const shorten = (t) => (t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t);

    nodeSel
      .append('text')
      .text((d) => shorten(d.title))
      .attr('x', 11)
      .attr('y', 3.5)
      .attr('fill', (d) => (d.id === selectedId ? '#f4b877' : '#c7c2b6'))
      .attr('font-size', width < 420 ? 10.5 : 11.5)
      .attr('font-family', 'ui-sans-serif, system-ui')
      .attr('font-weight', (d) => (d.id === selectedId ? 700 : 500))
      .style('pointer-events', 'none');

    const nodeRadius = width < 420 ? 6 : 8;
    const linkDistance = width < 420 ? 75 : 110;
    const chargeStrength = width < 420 ? -170 : -260;

    const sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(linkDistance).strength(0.6))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(nodeRadius * 5.5));

    simRef.current = sim;

    const fitToView = () => {
      const xs = nodes.map((d) => d.x);
      const ys = nodes.map((d) => d.y);
      const minX = Math.min(...xs) - 60;
      const maxX = Math.max(...xs) + 60;
      const minY = Math.min(...ys) - 30;
      const maxY = Math.max(...ys) + 30;
      const boxW = Math.max(maxX - minX, 1);
      const boxH = Math.max(maxY - minY, 1);
      const scale = Math.min(0.9, Math.min(width / boxW, height / boxH));
      const tx = width / 2 - scale * (minX + boxW / 2);
      const ty = height / 2 - scale * (minY + boxH / 2);
      svg
        .transition()
        .duration(400)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    sim.on('end', fitToView);
    // fallback: fit even if sim keeps low alpha ticking
    const fitTimer = setTimeout(fitToView, 900);

    return () => {
      sim.stop();
      clearTimeout(fitTimer);
    };
  }, [notes, selectedId]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ background: '#0e1116' }} />
    </div>
  );
}

export default function SegundoCerebro() {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('editor');
  const [search, setSearch] = useState('');
  const [askQuery, setAskQuery] = useState('');
  const [askResults, setAskResults] = useState([]);
  const [askAnswer, setAskAnswer] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState(null);
  const [askModel, setAskModel] = useState('anthropic');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 720;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await sbSelectNotas();
        const loadedNotes = (rows || []).map(rowToNote);
        setNotes(loadedNotes);
        setSelectedId(loadedNotes[0]?.id || null);
        setLoaded(true);
      } catch (e) {
        console.error('Erro ao carregar do Supabase', e);
        setSyncError(e.message);
        setNotes(SEED_NOTES);
        setSelectedId(SEED_NOTES[0].id);
        setLoaded(true);
      }
    })();
  }, []);

  const persistNote = useCallback(async (note) => {
    try {
      await sbUpdateNota(note);
      setSyncError(null);
    } catch (e) {
      console.error('Erro ao salvar nota no Supabase', e);
      setSyncError(e.message);
    }
  }, []);

  const syncLinks = useCallback(async (note, allNotes) => {
    try {
      await sbDeleteLinksFromOrigem(note.id);
      const linkTitles = extractLinks(note.content);
      const rows = [];
      linkTitles.forEach((lt) => {
        const target = allNotes.find(
          (n) => n.id !== note.id && n.title.toLowerCase() === lt.toLowerCase()
        );
        if (target) rows.push({ nota_origem_id: note.id, nota_destino_id: target.id });
      });
      await sbInsertLinks(rows);
    } catch (e) {
      console.error('Erro ao sincronizar links no Supabase', e);
    }
  }, []);

  const runAsk = useCallback(async (query) => {
    if (!query.trim()) return;
    setAskLoading(true);
    setAskError(null);
    setAskAnswer('');
    try {
      const data = await sbPerguntar(query, askModel);
      setAskAnswer(data.resposta || '');
      const usedTitles = (data.notas_usadas || []).map((t) => t.toLowerCase());
      const matched = notes.filter((n) => usedTitles.includes(n.title.toLowerCase()));
      setAskResults(matched);
    } catch (e) {
      console.error('Erro ao perguntar', e);
      setAskError(e.message);
      setAskResults([]);
    } finally {
      setAskLoading(false);
    }
  }, [notes, askModel]);

  const selected = notes.find((n) => n.id === selectedId);

  const updateNoteContent = (content) => {
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === selectedId ? { ...n, content, updatedAt: Date.now() } : n));
      const updated = next.find((n) => n.id === selectedId);
      if (updated) {
        persistNote(updated);
        syncLinks(updated, next);
      }
      return next;
    });
  };

  const updateNoteTitle = (title) => {
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === selectedId ? { ...n, title, updatedAt: Date.now() } : n));
      const updated = next.find((n) => n.id === selectedId);
      if (updated) persistNote(updated);
      return next;
    });
  };

  const createNote = (titleGuess) => {
    const id = uid();
    const newNote = { id, title: titleGuess || 'Nova nota', content: '', createdAt: Date.now(), updatedAt: Date.now() };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedId(id);
    setView('editor');
    (async () => {
      try {
        await sbInsertNota(newNote);
        setSyncError(null);
        syncLinks(newNote, [newNote, ...notes]);
      } catch (e) {
        console.error('Erro ao criar nota no Supabase', e);
        setSyncError(e.message);
      }
    })();
    return id;
  };

  const deleteNote = async (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await sbDeleteLinksFromOrigem(id);
      await fetch(`${SUPABASE_URL}/rest/v1/notas_links?nota_destino_id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
      });
      await sbDeleteNota(id);
      setSyncError(null);
    } catch (e) {
      console.error('Erro ao apagar nota no Supabase', e);
      setSyncError(e.message);
    }
    if (selectedId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setSelectedId(remaining[0]?.id || null);
    }
  };

  const handleContentClick = (e) => {
    const target = e.target.closest('.wiki-link');
    if (!target) return;
    const linkTitle = target.dataset.link;
    const existing = notes.find((n) => n.title.toLowerCase() === linkTitle.toLowerCase());
    if (existing) setSelectedId(existing.id);
    else createNote(linkTitle);
  };

  const allTags = useMemo(() => {
    const set = new Set();
    notes.forEach((n) => extractTags(n.content).forEach((t) => set.add(t)));
    return [...set];
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search]);

  const edgeCount = useMemo(() => {
    const titleToId = {};
    notes.forEach((n) => (titleToId[n.title.toLowerCase()] = n.id));
    let count = 0;
    notes.forEach((n) => {
      extractLinks(n.content).forEach((l) => {
        if (titleToId[l.toLowerCase()]) count++;
      });
    });
    return count;
  }, [notes]);

  const backlinks = useMemo(() => {
    if (!selected) return [];
    return notes.filter((n) => {
      if (n.id === selected.id) return false;
      const links = extractLinks(n.content).map((l) => l.toLowerCase());
      return links.includes(selected.title.toLowerCase());
    });
  }, [notes, selected]);

  if (!loaded) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingText}>carregando segundo cérebro…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>

      {sidebarOpen && isMobile && (
        <div style={styles.sidebarBackdrop} onClick={() => setSidebarOpen(false)} />
      )}

      {sidebarOpen && (
        <div style={isMobile ? styles.sidebarMobile : styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <span style={styles.brand}>🧠 segundo cérebro</span>
            <button style={styles.iconBtn} onClick={() => setSidebarOpen(false)} title="Fechar painel">
              <X size={16} />
            </button>
          </div>

          <div style={styles.searchBox}>
            <Search size={14} color="#7a8299" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar notas..." style={styles.searchInput} />
          </div>

          <button style={styles.newNoteBtn} onClick={() => createNote()}>
            <Plus size={15} /> Nova nota
          </button>

          <div style={styles.notesList}>
            {filteredNotes.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  setSelectedId(n.id);
                  setView('editor');
                }}
                style={{ ...styles.noteItem, ...(n.id === selectedId ? styles.noteItemActive : {}) }}
              >
                <FileText size={13} color={n.id === selectedId ? '#e8a05c' : '#7a8299'} />
                <span style={styles.noteItemTitle}>{n.title || 'Sem título'}</span>
                <Trash2
                  size={13}
                  color="#5c6373"
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Excluir "${n.title}"?`)) deleteNote(n.id);
                  }}
                />
              </div>
            ))}
            {filteredNotes.length === 0 && <div style={styles.emptyState}>Nenhuma nota encontrada.</div>}
          </div>

          {allTags.length > 0 && (
            <div style={styles.tagsSection}>
              <div style={styles.tagsHeader}>
                <Tag size={12} /> tags
              </div>
              <div style={styles.tagsWrap}>
                {allTags.map((t) => (
                  <span key={t} style={styles.tagPill} onClick={() => setSearch(t)}>
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={styles.main}>
        <div style={styles.topbar}>
          {!sidebarOpen && (
            <button style={styles.iconBtn} onClick={() => setSidebarOpen(true)}>
              <Menu size={17} />
            </button>
          )}
          <div style={styles.viewToggle}>
            <button style={{ ...styles.toggleBtn, ...(view === 'editor' ? styles.toggleBtnActive : {}) }} onClick={() => setView('editor')}>
              <FileText size={13} /> Nota
            </button>
            <button style={{ ...styles.toggleBtn, ...(view === 'graph' ? styles.toggleBtnActive : {}) }} onClick={() => setView('graph')}>
              <Network size={13} /> Grafo
            </button>
            <button style={{ ...styles.toggleBtn, ...(view === 'ask' ? styles.toggleBtnActive : {}) }} onClick={() => setView('ask')}>
              <Search size={13} /> Perguntar
            </button>
          </div>
          {!isMobile && (
            <div style={styles.stats}>
              {syncError ? (
                <span style={{ color: '#e07a5f' }}>⚠ erro ao sincronizar</span>
              ) : (
                `${notes.length} notas · ${edgeCount} conexões`
              )}
            </div>
          )}
          {isMobile && view === 'editor' && selected && (
            <button style={styles.previewToggleBtn} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Editar' : 'Ver'}
            </button>
          )}
        </div>

        {view === 'editor' && !selected && (
          <div style={styles.emptyMain}>
            <div style={styles.emptyMainText}>Nenhuma nota ainda</div>
            <button style={styles.newNoteBtn} onClick={() => createNote()}>
              <Plus size={15} /> Criar primeira nota
            </button>
          </div>
        )}

        {view === 'editor' && selected && (
          <div style={styles.editorWrap}>
            <input ref={titleRef} value={selected.title} onChange={(e) => updateNoteTitle(e.target.value)} style={styles.titleInput} placeholder="Título da nota" />
            <div style={isMobile ? styles.editorSplitMobile : styles.editorSplit}>
              {(!isMobile || !showPreview) && (
                <textarea
                  value={selected.content}
                  onChange={(e) => updateNoteContent(e.target.value)}
                  style={styles.textarea}
                  placeholder="Escreva aqui... use [[Nome]] para linkar notas e #tag para marcar"
                  spellCheck={false}
                />
              )}
              {(!isMobile || showPreview) && (
              <div style={styles.preview} onClick={handleContentClick}>
                {renderMarkdownLite(selected.content).map((block) => {
                  if (block.type === 'br') return <div key={block.key} style={{ height: 10 }} />;
                  if (block.type === 'h1') return <h1 key={block.key} style={styles.mdH1} dangerouslySetInnerHTML={{ __html: block.html }} />;
                  if (block.type === 'h2') return <h2 key={block.key} style={styles.mdH2} dangerouslySetInnerHTML={{ __html: block.html }} />;
                  if (block.type === 'h3') return <h3 key={block.key} style={styles.mdH3} dangerouslySetInnerHTML={{ __html: block.html }} />;
                  if (block.type === 'li') return <div key={block.key} style={styles.mdLi} dangerouslySetInnerHTML={{ __html: '• ' + block.html }} />;
                  return <p key={block.key} style={styles.mdP} dangerouslySetInnerHTML={{ __html: block.html }} />;
                })}
              </div>
              )}
            </div>

            {backlinks.length > 0 && (
              <div style={styles.backlinksBox}>
                <div style={styles.backlinksHeader}>← ligado a partir de</div>
                <div style={styles.backlinksList}>
                  {backlinks.map((n) => (
                    <span key={n.id} style={styles.backlinkPill} onClick={() => setSelectedId(n.id)}>
                      {n.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'graph' && (
          <div style={styles.graphWrap}>
            <GraphView notes={notes} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />
          </div>
        )}

        {view === 'ask' && (
          <div style={styles.askWrap}>
            <div style={styles.modelSelector}>
              {[
                { id: 'anthropic', label: 'Claude' },
                { id: 'openai', label: 'ChatGPT' },
                { id: 'gemini', label: 'Gemini' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAskModel(m.id)}
                  style={{
                    ...styles.modelBtn,
                    ...(askModel === m.id ? styles.modelBtnActive : {}),
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={styles.askBox}>
              <Search size={15} color="#7a8299" />
              <input
                autoFocus
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runAsk(askQuery);
                }}
                placeholder="Pergunte de verdade... ex: o que sei sobre a agência de marketing?"
                style={styles.askInput}
              />
              <button style={styles.askBtn} onClick={() => runAsk(askQuery)} disabled={askLoading}>
                {askLoading ? '...' : 'Buscar'}
              </button>
            </div>

            {askError && <div style={styles.askError}>⚠ {askError}</div>}

            {askAnswer && (
              <div style={styles.askAnswerBox}>
                <div style={styles.askAnswerLabel}>
                  🧠 resposta ·{' '}
                  {{ anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' }[askModel] || askModel}
                </div>
                <div style={styles.askAnswerText}>{askAnswer}</div>
              </div>
            )}

            {!askError && !askAnswer && askResults.length === 0 && !askLoading && askQuery && (
              <div style={styles.emptyState}>Nenhuma nota relevante encontrada.</div>
            )}

            {askResults.length > 0 && (
              <div style={styles.askSourcesLabel}>fontes usadas</div>
            )}
            <div style={styles.askResults}>
              {askResults.map((n) => (
                <div
                  key={n.id}
                  style={styles.askResultCard}
                  onClick={() => {
                    setSelectedId(n.id);
                    setView('editor');
                  }}
                >
                  <div style={styles.askResultTitle}>{n.title}</div>
                  <div style={styles.askResultSnippet}>
                    {n.content.replace(/\[\[|\]\]/g, '').slice(0, 220)}
                    {n.content.length > 220 ? '…' : ''}
                  </div>
                  {n.origem && <div style={styles.askResultOrigem}>origem: {n.origem}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const globalCss = `
  .wiki-link { color: #e8a05c; cursor: pointer; border-bottom: 1px dotted #e8a05c; }
  .wiki-link:hover { color: #f4b877; }
  .tag-chip { color: #7dbfa0; font-size: 0.92em; }
  * { box-sizing: border-box; }
`;

const styles = {
  loadingScreen: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0e1116', color: '#7a8299', fontFamily: 'ui-sans-serif, system-ui' },
  loadingText: { fontSize: 14 },
  app: { display: 'flex', height: '100vh', width: '100%', background: '#0e1116', fontFamily: 'ui-sans-serif, -apple-system, system-ui', color: '#e8e2d6', overflow: 'hidden' },
  sidebar: { width: 260, minWidth: 260, borderRight: '1px solid #232833', display: 'flex', flexDirection: 'column', background: '#12151c' },
  sidebarMobile: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: '84%',
    maxWidth: 320,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    background: '#12151c',
    boxShadow: '2px 0 24px rgba(0,0,0,0.5)',
  },
  sidebarBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 15,
  },
  previewToggleBtn: {
    marginLeft: 'auto',
    padding: '5px 12px',
    background: '#1f2430',
    color: '#e8a05c',
    border: '1px solid #2a3040',
    borderRadius: 7,
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px' },
  brand: { fontSize: 13.5, fontWeight: 600, letterSpacing: 0.2 },
  iconBtn: { background: 'transparent', border: 'none', color: '#8b91a0', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 12px 10px', padding: '7px 10px', background: '#1a1f29', border: '1px solid #262c38', borderRadius: 8 },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#e8e2d6', fontSize: 12.5, width: '100%' },
  newNoteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '0 12px 12px', padding: '8px 10px', background: '#e8a05c', color: '#1a1410', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  notesList: { flex: 1, overflowY: 'auto', padding: '0 8px' },
  noteItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: '#b7bcc9', marginBottom: 2 },
  noteItemActive: { background: '#1f2430', color: '#f0ece2' },
  noteItemTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  emptyState: { padding: 16, fontSize: 12, color: '#5c6373', textAlign: 'center' },
  tagsSection: { padding: '10px 14px 14px', borderTop: '1px solid #1e232d' },
  tagsHeader: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7180', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  tagsWrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tagPill: { fontSize: 11, padding: '3px 8px', background: '#1a2620', color: '#7dbfa0', borderRadius: 20, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e232d' },
  viewToggle: { display: 'flex', gap: 4, background: '#161a22', padding: 3, borderRadius: 8 },
  toggleBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'transparent', border: 'none', borderRadius: 6, fontSize: 12, color: '#8b91a0', cursor: 'pointer' },
  toggleBtnActive: { background: '#2a3040', color: '#e8a05c' },
  stats: { marginLeft: 'auto', fontSize: 11, color: '#5c6373', whiteSpace: 'nowrap' },
  editorWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 16px', overflow: 'hidden' },
  titleInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f0ece2', fontSize: 22, fontWeight: 700, marginBottom: 14, fontFamily: 'ui-sans-serif, system-ui' },
  editorSplit: { flex: 1, display: 'flex', gap: 18, minHeight: 0 },
  editorSplitMobile: { flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 },
  textarea: { flex: 1, background: '#12151c', border: '1px solid #1e232d', borderRadius: 10, padding: 16, color: '#d8d3c6', fontSize: 13.5, lineHeight: 1.6, resize: 'none', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  preview: { flex: 1, background: '#0f1319', border: '1px solid #1e232d', borderRadius: 10, padding: '16px 20px', overflowY: 'auto', fontSize: 13.5, lineHeight: 1.7 },
  mdH1: { fontSize: 19, fontWeight: 700, margin: '4px 0 8px', color: '#f0ece2' },
  mdH2: { fontSize: 16.5, fontWeight: 700, margin: '10px 0 6px', color: '#f0ece2' },
  mdH3: { fontSize: 14.5, fontWeight: 600, margin: '8px 0 5px', color: '#e8e2d6' },
  mdP: { margin: '4px 0', color: '#c7c2b6' },
  mdLi: { margin: '3px 0 3px 10px', color: '#c7c2b6' },
  backlinksBox: { marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e232d' },
  backlinksHeader: { fontSize: 11, color: '#6b7180', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  backlinksList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  backlinkPill: { fontSize: 11.5, padding: '4px 10px', background: '#1f2430', color: '#e8a05c', borderRadius: 20, cursor: 'pointer' },
  graphWrap: { flex: 1, background: '#0e1116' },
  askWrap: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', overflowY: 'auto' },
  modelSelector: { display: 'flex', gap: 6, marginBottom: 12, background: '#161a22', padding: 3, borderRadius: 8, width: 'fit-content' },
  modelBtn: { padding: '6px 14px', background: 'transparent', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#8b91a0', cursor: 'pointer' },
  modelBtnActive: { background: '#2a3040', color: '#e8a05c' },
  askBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#12151c',
    border: '1px solid #232833',
    borderRadius: 10,
    marginBottom: 18,
  },
  askInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e8e2d6', fontSize: 14 },
  askBtn: {
    padding: '7px 14px',
    background: '#e8a05c',
    color: '#1a1410',
    border: 'none',
    borderRadius: 7,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  askError: { color: '#e07a5f', fontSize: 12.5, marginBottom: 10 },
  askAnswerBox: {
    background: '#161b12',
    border: '1px solid #2e3a22',
    borderRadius: 10,
    padding: '16px 18px',
    marginBottom: 18,
  },
  askAnswerLabel: { fontSize: 11, color: '#7dbfa0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  askAnswerText: { fontSize: 14, color: '#e8e2d6', lineHeight: 1.65, whiteSpace: 'pre-wrap' },
  askSourcesLabel: { fontSize: 11, color: '#6b7180', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  askResults: { display: 'flex', flexDirection: 'column', gap: 10 },
  askResultCard: {
    background: '#12151c',
    border: '1px solid #1e232d',
    borderRadius: 10,
    padding: '12px 16px',
    cursor: 'pointer',
  },
  askResultTitle: { fontSize: 14, fontWeight: 700, color: '#f0ece2', marginBottom: 6 },
  askResultSnippet: { fontSize: 12.5, color: '#a8a29a', lineHeight: 1.5 },
  askResultOrigem: { fontSize: 10.5, color: '#5c6373', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyMain: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyMainText: { fontSize: 13.5, color: '#5c6373' },
};
