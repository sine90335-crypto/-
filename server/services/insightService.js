import { config } from '../config.js';

export function isLlmConfigured() {
  return Boolean(config.llm.apiKey);
}

function requireLlm() {
  if (!isLlmConfigured()) {
    const error = new Error('LLM_API_REQUIRED');
    error.code = 'LLM_API_REQUIRED';
    error.status = 503;
    error.publicMessage = '需要先配置 LLM API Key，才能生成 AI 回响。';
    throw error;
  }
}

function compactNotes(notes) {
  return notes.slice(-40).map((note) => ({
    id: note.id,
    content: note.content,
    mood: note.mood,
    pinned: note.pinned,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  }));
}

async function callLlm({ system, payload, temperature = 0.82 }) {
  requireLlm();

  let response;
  try {
    response = await fetch(`${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
  } catch {
    const error = new Error('LLM_NETWORK_ERROR');
    error.code = 'LLM_NETWORK_ERROR';
    error.status = 502;
    error.publicMessage = '暂时连接不上 LLM 服务，请检查网络或 API 配置。';
    throw error;
  }

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(`LLM request failed: ${response.status} ${message}`);
    error.code = 'LLM_REQUEST_FAILED';
    error.status = 502;
    error.publicMessage = 'LLM 暂时没有回应，请稍后再试。';
    throw error;
  }

  const json = await response.json();
  const content = String(json.choices?.[0]?.message?.content || '{}').trim();
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const error = new Error('LLM_JSON_PARSE_FAILED');
    error.status = 502;
    error.publicMessage = 'LLM 已回应，但返回格式不符合预期。';
    throw error;
  }
}

export async function createLlmInsight(notes, newest) {
  const parsed = await callLlm({
    system:
      '你是一个会读心的便签墙。根据用户已有便签和最新便签，输出短小、共情、戳人但不过度煽情的洞察。像真正听懂用户没说出口的部分，不做心理诊断，不说教。只返回 JSON，字段为 mood、thought、prompt。',
    payload: {
      newest: newest.content,
      notes: compactNotes(notes)
    }
  });

  return {
    mood: String(parsed.mood || '我听见了一些反复出现的在意。'),
    thought: String(parsed.thought || '这张便签像是在替你说出一小块没来得及被照顾的感受。'),
    prompt: String(parsed.prompt || '下一句，可以写写你真正想要的是什么。'),
    source: 'llm'
  };
}

export async function createWallSummary(notes) {
  const parsed = await callLlm({
    temperature: 0.72,
    system:
      '你是一个便签墙整理助手。阅读整面墙，提炼用户近期反复出现的主题、情绪和一个温柔提醒。只返回 JSON，字段为 title、themes、summary、reminder。themes 是 3 个以内字符串数组。',
    payload: { notes: compactNotes(notes) }
  });

  return {
    type: 'summary',
    title: String(parsed.title || '这面墙的近况'),
    themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 3).map(String) : [],
    summary: String(parsed.summary || '这里还需要更多便签，才能整理出稳定的主题。'),
    reminder: String(parsed.reminder || '先写下一句最真实的话。'),
    source: 'llm'
  };
}

export async function createConnectionMap(notes) {
  const parsed = await callLlm({
    temperature: 0.76,
    system:
      '你是一个便签关系分析助手。找出便签之间隐含的关联和重复出现的线索。只返回 JSON，字段为 title、links、hiddenThread。links 是最多 4 个对象，每个对象包含 from、to、reason。',
    payload: { notes: compactNotes(notes) }
  });

  return {
    type: 'connections',
    title: String(parsed.title || '藏在便签之间的线索'),
    links: Array.isArray(parsed.links) ? parsed.links.slice(0, 4) : [],
    hiddenThread: String(parsed.hiddenThread || '再多几张便签后，关联会更清楚。'),
    source: 'llm'
  };
}

export async function createNextPrompt(notes) {
  const parsed = await callLlm({
    temperature: 0.9,
    system:
      '你是一个温柔的自我表达引导者。根据这面便签墙，给用户 3 个下一张便签可以继续写的提示。只返回 JSON，字段为 prompts。prompts 是 3 个短句数组，不说教。',
    payload: { notes: compactNotes(notes) }
  });

  return {
    type: 'next-prompts',
    prompts: Array.isArray(parsed.prompts) ? parsed.prompts.slice(0, 3).map(String) : ['写写你最近最想逃开的事。'],
    source: 'llm'
  };
}
