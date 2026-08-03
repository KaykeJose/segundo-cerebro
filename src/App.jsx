import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { Search, Plus, Network, FileText, Trash2, Tag, X, Menu } from 'lucide-react';

// ---------- Supabase via API REST direta (mesmo padrão já usado no Make) ----------
const SUPABASE_URL = 'https://trddqvqbtvvwjqlgswwo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZGRxdnFidHZ2d2pxbGdzd3dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTEyMTEsImV4cCI6MjA5OTAyNzIxMX0.ojTwyRP0LpPDqloLghfCrmOsJD5lhoMZxGU0W4LyCa4';

// ---------- Autenticação (Supabase Auth, mesmo usuário do app de finanças) ----------
const AUTH_STORAGE_KEY = 'segundo_cerebro_session';

function getSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  if (session) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function sbLogin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Falha no login');
  setSession(data);
  return data;
}

async function sbRefreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    setSession(null);
    return null;
  }
  const data = await res.json();
  setSession(data);
  return data;
}

function sbLogout() {
  setSession(null);
}

function sbHeaders() {
  const session = getSession();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbSelectNotas() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notas?select=id,titulo,conteudo,origem,tags,criado_em,atualizado_em,arquivada&order=criado_em.asc`,
    { headers: sbHeaders() }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
  return res.json();
}

async function sbSelectAllLinks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notas_links?select=nota_origem_id,nota_destino_id`,
    { headers: sbHeaders() }
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
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
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
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
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
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${t}`);
  }
}

async function sbDeleteLinksFromOrigem(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_links?nota_origem_id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
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
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
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
    { headers: sbHeaders() }
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
    headers: { ...sbHeaders() },
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
    arquivada: !!row.arquivada,
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
function GraphView({ notes, selectedId, onSelect, dbLinks = [] }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const titleToId = {};
    notes.forEach((n) => (titleToId[n.title.toLowerCase()] = n.id));

    const nodes = notes.map((n) => ({
      id: n.id,
      title: n.title,
      tag: (n.tags && n.tags[0]) || null,
    }));
    const links = [];
    const seenPairs = new Set();
    const addLink = (sourceId, targetId) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const key = [sourceId, targetId].sort().join('::');
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      links.push({ source: sourceId, target: targetId });
    };

    // ligações escritas como [[texto]] dentro da nota
    notes.forEach((n) => {
      extractLinks(n.content).forEach((linkTitle) => {
        const targetId = titleToId[linkTitle.toLowerCase()];
        addLink(n.id, targetId);
      });
    });

    // ligações gravadas direto no banco (ex: pela revisão semanal automática)
    const noteIds = new Set(notes.map((n) => n.id));
    dbLinks.forEach((l) => {
      if (noteIds.has(l.nota_origem_id) && noteIds.has(l.nota_destino_id)) {
        addLink(l.nota_origem_id, l.nota_destino_id);
      }
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // ---------- fundo espacial ----------
    const defs = svg.append('defs');

    const bgGradient = defs
      .append('radialGradient')
      .attr('id', 'bg-space')
      .attr('cx', '50%')
      .attr('cy', '38%')
      .attr('r', '75%');
    bgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#241b3d');
    bgGradient.append('stop').attr('offset', '45%').attr('stop-color', '#140f26');
    bgGradient.append('stop').attr('offset', '100%').attr('stop-color', '#08060f');

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#bg-space)');

    // glow filter reutilizável nos nós
    const glow = defs.append('filter').attr('id', 'node-glow').attr('x', '-150%').attr('y', '-150%').attr('width', '400%').attr('height', '400%');
    glow.append('feGaussianBlur').attr('stdDeviation', 3.2).attr('result', 'blur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // partículas/estrelas sutis
    const starLayer = svg.append('g').attr('opacity', 0.55);
    const starCount = Math.round((width * height) / 9000);
    for (let i = 0; i < starCount; i++) {
      starLayer
        .append('circle')
        .attr('cx', Math.random() * width)
        .attr('cy', Math.random() * height)
        .attr('r', Math.random() * 1.1 + 0.2)
        .attr('fill', Math.random() > 0.85 ? '#e8c98a' : '#ffffff')
        .attr('opacity', Math.random() * 0.6 + 0.15);
    }

    const g = svg.append('g');

    // zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // arrow marker
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#6a5fa8');

    const linkSel = g
      .append('g')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#5b4f96')
      .attr('stroke-width', 1.1)
      .attr('opacity', 0.55)
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

    // halo suave por trás do nó (efeito "esfera brilhante")
    nodeSel
      .append('circle')
      .attr('r', nodeRadiusPre * 2.3)
      .attr('fill', (d) => (d.id === selectedId ? 'rgba(232,160,92,0.18)' : 'rgba(122,111,190,0.14)'))
      .style('pointer-events', 'none');

    nodeSel
      .append('circle')
      .attr('r', nodeRadiusPre)
      .attr('fill', (d) => (d.id === selectedId ? '#f0b86e' : '#8c7fd6'))
      .attr('stroke', (d) => (d.id === selectedId ? '#fddca0' : '#c4baf0'))
      .attr('stroke-width', 1.3)
      .attr('filter', 'url(#node-glow)');

    // badge de tag flutuando acima do nó
    nodeSel
      .filter((d) => !!d.tag)
      .append('rect')
      .attr('x', -1)
      .attr('y', -nodeRadiusPre - 22)
      .attr('rx', 6)
      .attr('height', 14)
      .attr('width', (d) => Math.max(30, d.tag.length * 6 + 10))
      .attr('fill', 'rgba(140,127,214,0.16)')
      .attr('stroke', 'rgba(196,186,240,0.35)')
      .attr('stroke-width', 0.6);

    nodeSel
      .filter((d) => !!d.tag)
      .append('text')
      .text((d) => d.tag.toUpperCase())
      .attr('x', 4)
      .attr('y', -nodeRadiusPre - 12)
      .attr('fill', '#c4baf0')
      .attr('font-size', 8)
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .attr('letter-spacing', 0.5)
      .style('pointer-events', 'none');

    const maxChars = width < 420 ? 12 : 22;
    const shorten = (t) => (t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t);

    nodeSel
      .append('text')
      .text((d) => shorten(d.title))
      .attr('x', 12)
      .attr('y', 3.5)
      .attr('fill', (d) => (d.id === selectedId ? '#fddca0' : '#e8e2ff'))
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
      linkSel.attr('d', (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.3;
        return `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    sim.on('end', fitToView);
    // fallback: fit even if sim keeps low alpha ticking
    const fitTimer = setTimeout(fitToView, 900);

    return () => {
      sim.stop();
      clearTimeout(fitTimer);
    };
  }, [notes, selectedId, dbLinks]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ background: '#0e1116' }} />
    </div>
  );
}

function SegundoCerebroApp({ onLogout }) {
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
  const contentRef = useRef(null);
  const [linkSuggest, setLinkSuggest] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dbLinks, setDbLinks] = useState([]);

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
        try {
          const linkRows = await sbSelectAllLinks();
          setDbLinks(linkRows || []);
        } catch (e) {
          console.error('Erro ao carregar links do Supabase', e);
        }
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

  // ---------- Autocomplete de [[links]] ----------
  const findOpenLinkQuery = (text, caret) => {
    const upto = text.slice(0, caret);
    const openIdx = upto.lastIndexOf('[[');
    if (openIdx === -1) return null;
    const closedAfterOpen = upto.indexOf(']]', openIdx);
    if (closedAfterOpen !== -1) return null;
    const query = upto.slice(openIdx + 2);
    if (query.includes('\n')) return null;
    return { start: openIdx + 2, query };
  };

  const getCaretCoords = (el, position) => {
    const div = document.createElement('div');
    const style = getComputedStyle(el);
    [
      'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
      'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform',
    ].forEach((p) => (div.style[p] = style[p]));
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.top = '0';
    div.style.left = '-9999px';
    div.style.height = 'auto';
    div.style.overflow = 'hidden';
    div.textContent = el.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = el.value.substring(position) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const coords = { left: span.offsetLeft, top: span.offsetTop };
    document.body.removeChild(div);
    return coords;
  };

  const syncLinkSuggestFromTextarea = (el, allNotes) => {
    if (!el) return;
    const caret = el.selectionStart;
    const match = findOpenLinkQuery(el.value, caret);
    if (!match) {
      setLinkSuggest(null);
      return;
    }
    const items = (allNotes || notes)
      .filter((n) => n.id !== selectedId && n.title.toLowerCase().includes(match.query.toLowerCase()))
      .slice(0, 6);
    const coords = getCaretCoords(el, caret);
    const rect = el.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 19;
    setLinkSuggest({
      query: match.query,
      start: match.start,
      end: caret,
      items,
      activeIndex: 0,
      top: rect.top + coords.top - el.scrollTop + lineHeight + 4,
      left: Math.min(rect.left + coords.left, rect.right - 220),
    });
  };

  const applyLinkSuggestion = (title) => {
    if (!linkSuggest || !selected) return;
    const el = contentRef.current;
    const val = selected.content;
    const before = val.slice(0, linkSuggest.start);
    const afterCaret = val.slice(linkSuggest.end);
    const newVal = `${before}${title}]]${afterCaret}`;
    updateNoteContent(newVal);
    setLinkSuggest(null);
    requestAnimationFrame(() => {
      if (el) {
        const pos = before.length + title.length + 2;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleContentKeyDown = (e) => {
    if (!linkSuggest) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLinkSuggest((s) => (s ? { ...s, activeIndex: Math.min(s.activeIndex + 1, Math.max(s.items.length - 1, 0)) } : s));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLinkSuggest((s) => (s ? { ...s, activeIndex: Math.max(s.activeIndex - 1, 0) } : s));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (linkSuggest.items.length > 0) {
        e.preventDefault();
        applyLinkSuggestion(linkSuggest.items[linkSuggest.activeIndex].title);
      }
    } else if (e.key === 'Escape') {
      setLinkSuggest(null);
    }
  };

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
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
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
    const base = showArchived ? notes : notes.filter((n) => !n.arquivada);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search, showArchived]);

  const archivedCount = useMemo(() => notes.filter((n) => n.arquivada).length, [notes]);

  const graphNotes = useMemo(
    () => (showArchived ? notes : notes.filter((n) => !n.arquivada)),
    [notes, showArchived]
  );

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

          {archivedCount > 0 && (
            <button
              style={{ ...styles.archiveToggle, ...(showArchived ? styles.archiveToggleActive : {}) }}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? '📂 Ocultar arquivadas' : `🗄️ Ver arquivadas (${archivedCount})`}
            </button>
          )}

          <div style={styles.notesList}>
            {filteredNotes.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  setSelectedId(n.id);
                  setView('editor');
                }}
                style={{
                  ...styles.noteItem,
                  ...(n.id === selectedId ? styles.noteItemActive : {}),
                  ...(n.arquivada ? styles.noteItemArchived : {}),
                }}
              >
                <FileText size={13} color={n.id === selectedId ? '#e8a05c' : '#7a8299'} />
                <span style={styles.noteItemTitle}>{n.title || 'Sem título'}</span>
                {n.arquivada && <span style={styles.archivedBadge}>arquivada</span>}
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
          <button style={styles.logoutBtn} onClick={onLogout} title="Sair">
            Sair
          </button>
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
                <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                  <textarea
                    ref={contentRef}
                    value={selected.content}
                    onChange={(e) => {
                      updateNoteContent(e.target.value);
                      syncLinkSuggestFromTextarea(e.target);
                    }}
                    onClick={(e) => syncLinkSuggestFromTextarea(e.target)}
                    onKeyUp={(e) => {
                      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                        syncLinkSuggestFromTextarea(e.target);
                      }
                    }}
                    onKeyDown={handleContentKeyDown}
                    onBlur={() => setTimeout(() => setLinkSuggest(null), 150)}
                    style={styles.textarea}
                    placeholder="Escreva aqui... use [[Nome]] para linkar notas e #tag para marcar"
                    spellCheck={false}
                  />
                  {linkSuggest && (
                    <div style={{ ...styles.linkSuggestBox, top: linkSuggest.top, left: linkSuggest.left }}>
                      {linkSuggest.items.length > 0 ? (
                        linkSuggest.items.map((n, i) => (
                          <div
                            key={n.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyLinkSuggestion(n.title);
                            }}
                            style={{
                              ...styles.linkSuggestItem,
                              ...(i === linkSuggest.activeIndex ? styles.linkSuggestItemActive : {}),
                            }}
                          >
                            {n.title}
                          </div>
                        ))
                      ) : (
                        <div style={styles.linkSuggestEmpty}>
                          {linkSuggest.query ? `Nenhuma nota com "${linkSuggest.query}"` : 'Digite pra buscar notas...'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
            <div style={styles.ticker}>
              <div style={styles.tickerTrack}>
                {[...notes, ...notes].map((n, i) => (
                  <span key={i} style={styles.tickerItem}>
                    <span style={styles.tickerDot} />
                    {n.title}
                  </span>
                ))}
              </div>
            </div>
            <GraphView notes={graphNotes} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} dbLinks={dbLinks} />
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
  @keyframes ticker-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
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
  archiveToggle: { margin: '0 12px 12px', padding: '7px 10px', background: 'transparent', border: '1px solid #262b38', borderRadius: 7, fontSize: 11.5, color: '#7a8299', cursor: 'pointer', textAlign: 'center' },
  archiveToggleActive: { background: '#1f2430', color: '#e8a05c', borderColor: '#3a3020' },
  noteItemArchived: { opacity: 0.55 },
  archivedBadge: { fontSize: 9.5, color: '#8b7355', background: '#241f16', border: '1px solid #3a3020', borderRadius: 4, padding: '1px 5px', marginLeft: 6, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.3 },
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
  linkSuggestBox: {
    position: 'fixed',
    zIndex: 50,
    minWidth: 200,
    maxWidth: 280,
    maxHeight: 220,
    overflowY: 'auto',
    background: '#181c25',
    border: '1px solid #2a3040',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    padding: 4,
  },
  linkSuggestItem: {
    padding: '7px 10px',
    borderRadius: 5,
    fontSize: 13,
    color: '#d8d3c6',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  linkSuggestItemActive: { background: '#2a3040', color: '#f4b877' },
  linkSuggestEmpty: { padding: '8px 10px', fontSize: 12, color: '#5c6373' },
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
  graphWrap: { flex: 1, background: '#08060f', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  ticker: {
    position: 'relative',
    zIndex: 2,
    height: 30,
    overflow: 'hidden',
    background: 'rgba(20,15,38,0.75)',
    borderBottom: '1px solid rgba(140,127,214,0.25)',
    backdropFilter: 'blur(4px)',
  },
  tickerTrack: {
    display: 'flex',
    alignItems: 'center',
    gap: 28,
    whiteSpace: 'nowrap',
    animation: 'ticker-scroll 30s linear infinite',
    padding: '0 16px',
    height: '100%',
  },
  tickerItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: '#c4baf0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  tickerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#f0b86e',
    display: 'inline-block',
  },
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

  loginWrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0c11',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  loginCard: {
    width: 340,
    maxWidth: '90vw',
    background: '#12151c',
    border: '1px solid #1e232d',
    borderRadius: 14,
    padding: '32px 28px',
  },
  loginTitle: { fontSize: 19, fontWeight: 700, color: '#f0ece2', marginBottom: 4 },
  loginSubtitle: { fontSize: 13, color: '#6b7180', marginBottom: 24 },
  loginInput: {
    width: '100%',
    background: '#0d1016',
    border: '1px solid #1e232d',
    borderRadius: 8,
    padding: '11px 13px',
    fontSize: 14,
    color: '#e8e2d6',
    marginBottom: 12,
    outline: 'none',
    boxSizing: 'border-box',
  },
  loginBtn: {
    width: '100%',
    background: '#e8a05c',
    color: '#12151c',
    border: 'none',
    borderRadius: 8,
    padding: '11px 13px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
  },
  loginError: { fontSize: 12.5, color: '#e07a5f', marginBottom: 12 },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #262b38',
    borderRadius: 7,
    padding: '6px 12px',
    fontSize: 11.5,
    color: '#6b7180',
    cursor: 'pointer',
    marginLeft: 8,
  },
};

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sbLogin(email.trim(), password);
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginWrap}>
      <form style={styles.loginCard} onSubmit={submit}>
        <div style={styles.loginTitle}>🧠 Segundo Cérebro</div>
        <div style={styles.loginSubtitle}>Entre para acessar suas notas</div>
        {error && <div style={styles.loginError}>{error}</div>}
        <input
          style={styles.loginInput}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <input
          style={styles.loginInput}
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button style={styles.loginBtn} type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default function SegundoCerebro() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const session = getSession();
      if (!session) {
        setChecking(false);
        return;
      }
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      if (Date.now() >= expiresAt - 30000) {
        const refreshed = await sbRefreshSession();
        setAuthed(!!refreshed);
      } else {
        setAuthed(true);
      }
      setChecking(false);
    })();
  }, []);

  const handleLogout = useCallback(() => {
    sbLogout();
    setAuthed(false);
  }, []);

  if (checking) {
    return <div style={styles.loginWrap}></div>;
  }

  if (!authed) {
    return <LoginScreen onLoggedIn={() => setAuthed(true)} />;
  }

  return <SegundoCerebroApp onLogout={handleLogout} />;
}
