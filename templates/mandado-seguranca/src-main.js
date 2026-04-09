import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

// ── ESTADO ──────────────────────────────────────────────
let sdInstance = null;
let currentFileName = 'documento.docx';
let pendingInsert = null;

// ── SUPERDOC ─────────────────────────────────────────────
function iniciarEditor(file) {
  currentFileName = file.name;
  document.getElementById('filename').textContent = file.name;
  document.getElementById('upload-screen').style.display = 'none';
  const editorEl = document.getElementById('sd-editor');
  editorEl.style.display = 'flex';
  document.getElementById('btn-salvar').style.display = 'inline-block';

  // Destruir instância anterior
  if (sdInstance) {
    try { sdInstance.destroy?.(); } catch {}
    editorEl.innerHTML = '';
  }

  sdInstance = new SuperDoc({
    selector: '#sd-editor',
    toolbar: '#sd-toolbar',
    document: file,
    documentMode: 'editing',
    user: { name: 'Advogado', email: 'adv@escritorio.com' },
  });

  sdInstance.on('ready', () => {
    console.log('SuperDoc pronto');
  });
}

// ── ARQUIVO ──────────────────────────────────────────────
window.abrirArquivo = () => document.getElementById('file-input').click();

document.getElementById('file-input').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) iniciarEditor(f);
  e.target.value = '';
});

// Drag & drop
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f?.name.endsWith('.docx')) iniciarEditor(f);
});

window.salvar = async () => {
  if (!sdInstance) return;
  try {
    const blob = await sdInstance.export({ isFinalDoc: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = currentFileName; a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  }
};

// ── PAINEL CLAUDE ────────────────────────────────────────
window.togglePainel = () => {
  const painel = document.getElementById('claude-panel');
  const btn = document.getElementById('btn-ai');
  painel.classList.toggle('open');
  btn.classList.toggle('active');
};

// ── CONFIG API KEY ────────────────────────────────────────
window.abrirConfig = () => {
  const k = localStorage.getItem('anthropic_key') || '';
  document.getElementById('api-key-input').value = k;
  document.getElementById('modal-config').classList.add('open');
};
window.fecharConfig = () => document.getElementById('modal-config').classList.remove('open');
window.salvarConfig = () => {
  const k = document.getElementById('api-key-input').value.trim();
  if (k) localStorage.setItem('anthropic_key', k);
  fecharConfig();
  adicionarMensagemAI('API Key salva! Agora posso ajudar com seu documento. O que precisa?');
};

// ── CHAT ─────────────────────────────────────────────────
function getApiKey() {
  return localStorage.getItem('anthropic_key') || '';
}

function adicionarMensagem(texto, tipo) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = `chat-msg ${tipo}`;
  div.innerHTML = texto;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function adicionarMensagemAI(texto, htmlParaInserir = null) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.innerHTML = texto;
  if (htmlParaInserir) {
    const btn = document.createElement('button');
    btn.className = 'insert-btn';
    btn.textContent = '↓ Inserir no documento';
    btn.onclick = () => inserirNoDocumento(htmlParaInserir);
    div.appendChild(btn);
  }
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

async function chamarClaude(systemPrompt, userMessage) {
  const key = getApiKey();
  if (!key) {
    adicionarMensagemAI('⚙ Configure sua API Key clicando no ícone de configurações.');
    return null;
  }

  const contexto = await getDocumentoContexto();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage + (contexto ? `\n\n---\nCONTEÚDO ATUAL DO DOCUMENTO:\n${contexto}` : '') }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function getDocumentoContexto() {
  if (!sdInstance) return '';
  try {
    const ed = sdInstance.activeEditor;
    return ed?.getText?.() || ed?.state?.doc?.textContent || '';
  } catch { return ''; }
}

window.enviarMensagem = async () => {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  adicionarMensagem(msg, 'user');

  const btn = document.getElementById('chat-send');
  btn.disabled = true;
  const loading = adicionarMensagem('<span class="chat-thinking">Claude está pensando...</span>', 'ai');

  try {
    const resposta = await chamarClaude(
      `Você é um assistente jurídico especializado em direito brasileiro.
      Ajude com redação jurídica, argumentação, análise de documentos e legal design.
      Seja preciso, técnico e objetivo.
      Quando gerar HTML para inserir no documento, use formatação limpa com tags simples: <p>, <strong>, <em>, <ul>, <ol>, <li>, <table>, <tr>, <td>, <th>, <h2>, <h3>.`,
      msg
    );

    loading.remove();

    // Detectar se a resposta contém HTML inserível
    const temHTML = /<[ph][1-6]?|<ul|<ol|<table|<strong|<em/i.test(resposta);
    adicionarMensagemAI(
      resposta.replace(/\n/g, '<br>'),
      temHTML ? resposta : null
    );

  } catch (e) {
    loading.remove();
    adicionarMensagemAI(`❌ Erro: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
};

// Enter para enviar
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
});

// ── AÇÕES RÁPIDAS ─────────────────────────────────────────
window.acaoRapida = async (prompt) => {
  if (!document.getElementById('claude-panel').classList.contains('open')) togglePainel();
  adicionarMensagem(prompt, 'user');

  const btn = document.getElementById('chat-send');
  btn.disabled = true;
  const loading = adicionarMensagem('<span class="chat-thinking">Claude está pensando...</span>', 'ai');

  try {
    const resposta = await chamarClaude(
      'Você é um assistente jurídico. Seja conciso e objetivo. Responda em português.',
      prompt
    );
    loading.remove();
    adicionarMensagemAI(resposta.replace(/\n/g, '<br>'));
  } catch (e) {
    loading.remove();
    adicionarMensagemAI(`❌ ${e.message}`);
  } finally {
    btn.disabled = false;
  }
};

// ── ELEMENTOS DE LEGAL DESIGN ────────────────────────────
const ELEMENTOS = {
  callout: {
    titulo: 'Caixa de Destaque',
    prompt: 'Gere HTML para uma caixa de destaque jurídico (callout) com título "Ponto Central" e conteúdo relevante baseado no documento. Use apenas: <div>, <p>, <strong>. Retorne APENAS o HTML, sem explicações.',
  },
  'tabela-partes': {
    titulo: 'Tabela de Partes',
    prompt: 'Gere HTML de uma tabela simples com colunas: Papel | Nome | Qualificação. Use tags <table><tr><th><td>. Retorne APENAS o HTML.',
  },
  timeline: {
    titulo: 'Linha do Tempo',
    prompt: 'Gere HTML de uma linha do tempo de eventos jurídicos com 4-5 itens. Formato: lista ordenada <ol> com data e descrição em cada <li>. Retorne APENAS o HTML.',
  },
  'tabela-pedidos': {
    titulo: 'Tabela de Pedidos',
    prompt: 'Gere HTML de uma tabela de pedidos jurídicos com colunas: Nº | Pedido | Fundamentação Legal. Preencha com 3 linhas de exemplo. Use <table><tr><th><td>. Retorne APENAS o HTML.',
  },
  assinatura: {
    titulo: 'Bloco de Assinatura',
    prompt: 'Gere HTML de um bloco de assinatura jurídico com: local e data, linha de assinatura, nome do advogado e OAB. Use <p> e <strong>. Retorne APENAS o HTML.',
  },
  alerta: {
    titulo: 'Caixa de Alerta',
    prompt: 'Gere HTML de uma caixa de alerta com ícone ⚠ e texto sobre prazo decadencial ou processual importante. Use <p> e <strong>. Retorne APENAS o HTML.',
  },
  'lista-numerada': {
    titulo: 'Lista Multinível',
    prompt: 'Gere HTML de uma lista jurídica multinível com 3 itens principais e 2 subitens cada. Use <ol><li> aninhados. Retorne APENAS o HTML.',
  },
  comparativo: {
    titulo: 'Tabela Comparativa',
    prompt: 'Gere HTML de uma tabela comparativa jurídica com cabeçalho "Fundamento Relevante | Risco de Ineficácia" e 3 linhas. Use <table><tr><th><td>. Retorne APENAS o HTML.',
  },
};

window.inserirElemento = async (tipo) => {
  if (!document.getElementById('claude-panel').classList.contains('open')) togglePainel();

  const el = ELEMENTOS[tipo];
  if (!el) return;

  const loading = adicionarMensagem(`<span class="chat-thinking">Gerando ${el.titulo}...</span>`, 'ai');
  document.getElementById('chat-send').disabled = true;

  try {
    const html = await chamarClaude(
      'Você é um especialista em legal design. Gere HTML limpo e semântico. Retorne APENAS HTML puro, sem markdown, sem explicações, sem ```html.',
      el.prompt
    );
    loading.remove();

    // Mostrar modal para revisar antes de inserir
    pendingInsert = html;
    document.getElementById('modal-ins-titulo').textContent = el.titulo;
    document.getElementById('modal-ins-conteudo').value = html;
    document.getElementById('modal-inserir').classList.add('open');

  } catch (e) {
    loading.remove();
    adicionarMensagemAI(`❌ ${e.message}`);
  } finally {
    document.getElementById('chat-send').disabled = false;
  }
};

window.fecharInserir = () => {
  document.getElementById('modal-inserir').classList.remove('open');
  pendingInsert = null;
};

window.confirmarInserir = () => {
  const html = document.getElementById('modal-ins-conteudo').value;
  if (html) inserirNoDocumento(html);
  fecharInserir();
};

function inserirNoDocumento(html) {
  if (!sdInstance) {
    adicionarMensagemAI('⚠ Abra um documento primeiro para inserir conteúdo.');
    return;
  }
  try {
    const ed = sdInstance.activeEditor;
    if (ed?.commands?.insertContent) {
      ed.commands.insertContent(html);
      adicionarMensagemAI('✓ Conteúdo inserido no documento.');
    } else {
      // Fallback: clipboard
      navigator.clipboard.writeText(html).then(() => {
        adicionarMensagemAI('✓ Conteúdo copiado! Cole no documento com Ctrl+V.');
      });
    }
  } catch (e) {
    navigator.clipboard.writeText(html).catch(() => {});
    adicionarMensagemAI('Conteúdo copiado para a área de transferência. Cole com Ctrl+V.');
  }
}
