/**
 * Horizon Changelog — fuzzy search engine
 *
 * Возможности:
 *  - Fuzzy-сопоставление: точное > prefix > Левенштейн > субпоследовательность
 *  - Мульти-токенный запрос: AND по умолчанию, OR через |, NEG через -
 *  - Поиск по полям: author:, pr:, type:, source:, repo:, title:, body:
 *  - Точная фраза в кавычках: "exact phrase"
 *  - Нормализация ru: ё→е, lowercase, trim
 *  - Ранжирование по релевантности с весами полей
 *  - Метаданные совпадений для подсветки в рендере
 *
 * Зависимостей нет, vanilla JS, expose as window.ChangelogSearch
 */
(function (global) {
  'use strict';

  // ё→е, lowercase, схлопываем множественные пробелы
  const normalize = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Классический алгоритм, два ряда для экономии памяти.
  function levenshtein(a, b, maxDistance) {
    const al = a.length;
    const bl = b.length;
    if (Math.abs(al - bl) > maxDistance) return Number.POSITIVE_INFINITY;
    if (al === 0) return bl;
    if (bl === 0) return al;

    let prev = new Array(bl + 1);
    let curr = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;

    for (let i = 1; i <= al; i++) {
      curr[0] = i;
      let rowMin = curr[0];
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= bl; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,        // deletion
          curr[j - 1] + 1,    // insertion
          prev[j - 1] + cost  // substitution
        );
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      // Если минимальное значение в ряду уже превышает порог — дальше только хуже
      if (rowMin > maxDistance) return Number.POSITIVE_INFINITY;
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[bl];
  }

  // Порог Левенштейна зависит от длины токена:
  // 1-3 символа: 0 (точное только — иначе слишком шумно)
  // 4-5 символов: 1
  // 6+ символов: 2
  function levenshteinThreshold(tokenLen) {
    if (tokenLen <= 3) return 0;
    if (tokenLen <= 5) return 1;
    return 2;
  }

  // ============================================================
  // FUZZY SUBSEQUENCE MATCH (как fzf, но в пределах одного слова)
  // ============================================================

  // Проверяет, встречаются ли символы pattern в одном слове text в том же порядке,
  // не обязательно подряд. Возвращает {score, positions} или null.
  //
  // ВАЖНО: совпадение обязано быть в пределах ОДНОГО слова [\w]+.
  // Старая версия сканировала весь text и находила, например, 'meteors'
  // как 'da[M]ag[E] ins[T][E]ad [O]f fo[R] [S]' — это давало сотни false
  // positives на длинных body. Ограничение «внутри слова» убирает этот шум:
  // 'rvnt' найдёт 'revenant' (один токен), но 'meteors' не найдёт
  // ничего в тексте без реального слова, близкого к 'meteors'.
  //
  // Скоринг:
  //  - Бонус за подряд идущие символы (adjacent)
  //  - Бонус за совпадение в начале слова
  //  - Штраф за большие пропуски между символами
  function fuzzySubsequence(pattern, text) {
    if (!pattern) return null;
    const pl = pattern.length;
    if (pl > 8) return null; // длинные паттерны — это не аббревиатура, нужен Левенштейн
    const tl = text.length;
    if (pl > tl) return null;

    let best = null;
    // Разбиваем text на слова (включая позиции в исходной строке)
    const wordRe = /[\w]+/g;
    let wm;
    while ((wm = wordRe.exec(text)) !== null) {
      const word = wm[0];
      const wordStart = wm.index;
      if (pl > word.length) continue; // не влезет — пропускаем

      // Ищем subsequence внутри этого слова
      const positions = new Array(pl);
      let pi = 0;
      let prevIdx = -1;
      let adjacentBonus = 0;
      let wordStartBonus = 0;

      for (let ti = 0; ti < word.length && pi < pl; ti++) {
        if (word.charCodeAt(ti) === pattern.charCodeAt(pi)) {
          positions[pi] = wordStart + ti; // абсолютная позиция в text — для подсветки
          if (prevIdx !== -1 && ti === prevIdx + 1) adjacentBonus += 8;
          if (ti === 0) wordStartBonus += 5; // совпадение в начале слова
          prevIdx = ti;
          pi++;
        }
      }

      if (pi < pl) continue; // не все символы найдены в этом слове

      const spread = positions[pl - 1] - positions[0] + 1;
      const densityScore = Math.max(0, 30 - (spread - pl) * 2);
      const score = 25 + densityScore + adjacentBonus + wordStartBonus;

      if (!best || score > best.score) {
        best = { score, positions };
      }
    }

    return best;
  }

  // ТОЧЕНОЕ СОВПАДЕНИЕ ПОДСТРОКИ С ПОЗИЦИЯМИ
  function findAllOccurrences(needle, haystack) {
    const positions = [];
    if (!needle) return positions;
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      positions.push([idx, idx + needle.length]);
      from = idx + 1;
    }
    return positions;
  }

  // ============================================================
  // ПОИСК ПО ЛЕВЕНШТЕЙНУ ПО СЛОВАМ
  // ============================================================

  // Разбивает text на слова, ищет ближайшее к token по Левенштейну.
  // Возвращает {score, positions} или null.
  //
  // guard: для токенов от 5 символов требует, чтобы первые 2 символа
  // совпадали — это отсекает ложные срабатывания на словах с тем же
  // окончанием, но разным началом (например 'methods' vs 'meteors'
  // имеют distance=2, но это разные слова).
  function fuzzyWordMatch(token, text, threshold) {
    if (threshold <= 0) return null;
    // Разбивка по не-буквенно-цифровым
    const words = [];
    const re = /[\p{L}\p{N}]+/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
      words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }

    // Guard: для токенов от 5 символов требуем совпадения первых 2 символов.
    // 'meteors' (7) должен найти 'meteor' (distance 1, общее начало 6 символов),
    // но не 'methods' (distance 2, общее начало только 3 символа).
    const requireCommonPrefix = token.length >= 5 ? 2 : 0;

    let best = null;
    for (const w of words) {
      if (Math.abs(w.word.length - token.length) > threshold) continue;
      if (requireCommonPrefix > 0) {
        let common = 0;
        const maxCheck = Math.min(requireCommonPrefix, token.length, w.word.length);
        for (let i = 0; i < maxCheck; i++) {
          if (w.word[i] === token[i]) common++;
          else break;
        }
        if (common < requireCommonPrefix) continue;
      }
      const d = levenshtein(token, w.word, threshold);
      if (d === Number.POSITIVE_INFINITY) continue;
      // Скор: 60 - d*10 — точное совпадение дало бы 60, но точное уже обработано раньше.
      // Это fallback для опечаток.
      const score = 60 - d * 10;
      if (!best || score > best.score) {
        best = { score, positions: [[w.start, w.end]] };
      }
    }
    return best;
  }

  // ============================================================
  // СОПОСТАВЛЕНИЕ ОДНОГО ТОКЕНА С ОДНИМ ПОЛЕМ
  // ============================================================

  // Сопоставление одного токена с одним полем.
  // Возвращает {score, positions} или null.
  // positions — массив [start,end] диапазонов для подсветки.
  //
  // options:
  //   allowExact       — включать точное подстрочное совпадение (default: true)
  //   allowFuzzy       — включать Левенштейна по словам (default: true)
  //   allowSubsequence — включать fzf-субпоследовательность (default: true)
  function matchTokenToField(token, fieldText, options) {
    if (!token || !fieldText) return null;
    const t = normalize(token);
    const f = normalize(fieldText);
    if (!t || !f) return null;

    const opts = options || {};
    const allowExact = opts.allowExact !== false;
    const allowFuzzy = opts.allowFuzzy !== false;
    const allowSubsequence = opts.allowSubsequence !== false;

    // 1. Точное подстрочное совпадение — наивысший скор
    if (allowExact) {
      const exactPositions = findAllOccurrences(t, f);
      if (exactPositions.length > 0) {
        let bonus = 0;
        for (const [s] of exactPositions) {
          if (s === 0 || /[\s\-_.,;:!?()[\]{}"'`/@\\|]/.test(f[s - 1])) {
            bonus += 10;
            break;
          }
        }
        return { score: 100 + bonus, positions: exactPositions };
      }
    }

    // 2. Левенштейн по словам (опечатки) — не для очень коротких токенов
    if (allowFuzzy) {
      const threshold = levenshteinThreshold(t.length);
      if (threshold > 0) {
        const lm = fuzzyWordMatch(t, f, threshold);
        if (lm) return lm;
      }
    }

    // 3. Субпоследовательность (fzf-style) — только для токенов 3-8 символов,
    // чтобы обслуживать аббревиатуры вроде 'rvnt' → 'revenant'.
    // Совпадение обязано быть в пределах одного слова — это убирает ложные
    // срабатывания на длинных текстах, где 'meteors' находилось как набор
    // разрозненных букв в разных словах.
    // positions = [] — подсветка отдельных символов subsequence визуально
    // шумит, поэтому subsequence используется только для ранжирования.
    if (allowSubsequence && t.length >= 3 && t.length <= 8) {
      const sm = fuzzySubsequence(t, f);
      if (sm) {
        return { score: sm.score, positions: [] };
      }
    }

    return null;
  }

  // ============================================================
  // ТОКЕНАЙЗЕР ЗАПРОСА
  // ============================================================

  // Поддерживаемые поля
  const FIELD_QUALIFIERS = new Set([
    'author', 'pr', 'type', 'source', 'repo', 'title', 'body', 'changes'
  ]);

  // Парсит запрос в структуру:
  // {
  //   tokens: [
  //     { raw, value, negated, field, alternatives: [value, value, ...] }
  //   ],
  //   errors: ['...']
  // }
  //
  // Примеры:
  //   fix damage              → 2 токена, оба positive, field=null
  //   "fix damage"            → 1 токен-фраза, value='fix damage'
  //   author:papa             → 1 токен, field='author'
  //   fix -revenant           → 2 токена, второй negated
  //   fix|repair              → 1 токен с alternatives=['fix','repair']
  //   type:bugfix             → 1 токен, field='type', точное
  //   pr:97690                → 1 токен, field='pr', точное
  function parseQuery(query) {
    const result = { tokens: [], errors: [] };
    const normalized = normalize(query);
    if (!normalized) return result;

    // Разбиваем по пробелам, но уважаем кавычки
    const rawTokens = [];
    let i = 0;
    while (i < normalized.length) {
      // Пропуск пробелов
      while (i < normalized.length && normalized[i] === ' ') i++;
      if (i >= normalized.length) break;

      // Проверяем кавычку
      if (normalized[i] === '"') {
        const end = normalized.indexOf('"', i + 1);
        if (end === -1) {
          // Незакрытая кавычка — берём до конца
          rawTokens.push({ isPhrase: true, value: normalized.slice(i + 1) });
          break;
        }
        rawTokens.push({ isPhrase: true, value: normalized.slice(i + 1, end) });
        i = end + 1;
      } else {
        // Обычный токен — до следующего пробела или кавычки
        let j = i;
        while (j < normalized.length && normalized[j] !== ' ' && normalized[j] !== '"') j++;
        rawTokens.push({ isPhrase: false, value: normalized.slice(i, j) });
        i = j;
      }
    }

    for (const rt of rawTokens) {
      let value = rt.value;
      let negated = false;
      let field = null;

      // Негация
      if (value.startsWith('-') && value.length > 1) {
        negated = true;
        value = value.slice(1);
      }

      // field:VALUE
      const colonIdx = value.indexOf(':');
      if (colonIdx > 0 && !rt.isPhrase) {
        const possibleField = value.slice(0, colonIdx).toLowerCase();
        if (FIELD_QUALIFIERS.has(possibleField)) {
          field = possibleField;
          value = value.slice(colonIdx + 1);
        }
      }

      // Кавычки внутри значения (например author:"papa michae1")
      let isPhrase = rt.isPhrase;
      if (!isPhrase && value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        isPhrase = true;
        value = value.slice(1, -1);
      }

      // Альтернативы через | (только для не-phrase)
      let alternatives = [value];
      if (!isPhrase && value.includes('|')) {
        alternatives = value.split('|').map(s => s.trim()).filter(s => s.length > 0);
      }

      if (alternatives.length === 0 || alternatives.every(a => a.length === 0)) {
        result.errors.push('Пустой токен');
        continue;
      }

      result.tokens.push({
        raw: rt.value,
        value: alternatives[0],
        alternatives,
        negated,
        field,
        isPhrase
      });
    }

    return result;
  }

  // КЛАСС ПОИСКОВОГО ИНДЕКСА
  // Веса полей при скоринге
  const FIELD_WEIGHTS = {
    pr: 5,        // точное совпадение номера PR — наивысший приоритет
    author: 4,    // точное совпадение автора
    source: 3,    // точное совпадение источника
    type: 3,      // совпадение типа изменения (bugfix, rscadd, ...)
    title: 3,     // совпадение в заголовке
    changes: 2,   // совпадение в тексте изменений
    repo: 2,
    body: 1       // совпадение в теле PR
  };

  class ChangelogSearch {
    constructor() {
      this.items = [];
      this.fields = [];
      this.fuzzyEnabled = true;
    }

    /**
     * Включить/выключить fuzzy-режим.
     * @param {boolean} enabled
     */
    setFuzzyEnabled(enabled) {
      this.fuzzyEnabled = !!enabled;
    }

    /**
     * Загрузить элементы в индекс.
     * @param {Array} items — массив объектов из JSON чейнджлогов
     */
    setItems(items) {
      this.items = items || [];
      // Предизвлекаем и нормализуем поля один раз
      this.fields = this.items.map(item => ({
        title: normalize(item.title || ''),
        author: normalize(item.author || ''),
        pr: normalize(String(item.pr || '')),
        source: normalize(item.source || ''),
        repo: normalize(item.repo || ''),
        body: normalize(item.body || ''),
        changes: (item.changes || []).map(ch => ({
          type: normalize(ch.type || ''),
          text: normalize(ch.text || '')
        })),
        // Сводный текст изменений для быстрого поиска без перебора
        changesText: (item.changes || []).map(ch => normalize(ch.text || '')).join(' \n '),
        changesTypes: (item.changes || []).map(ch => normalize(ch.type || '')).join(' ')
      }));
    }

    /**
     * Поиск по запросу.
     * @param {string} query
     * @returns {Array<{item, score, matches}>}
     *   matches: { title: [[s,e],...], author: [...], pr: [...], body: [...],
     *              changes: [{idx, ranges: [[s,e],...]}] }
     */
    search(query) {
      const parsed = parseQuery(query);
      if (parsed.tokens.length === 0) {
        // Пустой запрос — возвращаем всё без подсветки
        return this.items.map(item => ({ item, score: 0, matches: {} }));
      }

      const results = [];
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        const fields = this.fields[i];

        let totalScore = 0;
        let allRequiredMatched = true;
        let anyNegatedMatched = false;
        const matches = {
          title: [], author: [], pr: [], body: [],
          source: [], repo: [], changes: []
        };

        for (const token of parsed.tokens) {
          const matched = this._matchToken(token, fields, matches);
          if (token.negated) {
            if (matched.matched) {
              anyNegatedMatched = true;
              break; // дальше можно не смотреть — токен исключён
            }
          } else {
            if (!matched.matched) {
              allRequiredMatched = false;
              break;
            }
            totalScore += matched.score;
          }
        }

        if (anyNegatedMatched) continue;
        if (!allRequiredMatched) continue;

        results.push({ item, score: totalScore, matches });
      }

      // Сортировка: по скору убывание, при равенстве — по дате убывание
      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const da = (a.item.upstream_date || a.item.date || '');
        const db = (b.item.upstream_date || b.item.date || '');
        return da < db ? 1 : da > db ? -1 : 0;
      });

      return results;
    }

    _matchToken(token, fields, matches) {
      let phraseOpts = null;
      if (token.isPhrase) {
        phraseOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (token.negated) {
        phraseOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (!this.fuzzyEnabled) {
        phraseOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      }

      // Если поле указано явно — ищем только в нём
      if (token.field) {
        return this._matchTokenInField(token, fields, matches, token.field);
      }

      // Иначе — ищем во всех полях, берём лучший скор
      let bestScore = 0;
      let bestMatched = false;

      const tryField = (fieldName, text, weight, onMatch) => {
        let best = null;
        for (const alt of token.alternatives) {
          const r = matchTokenToField(alt, text, phraseOpts);
          if (r && (!best || r.score > best.score)) best = r;
        }
        if (best) {
          bestMatched = true;
          const score = best.score * weight;
          if (score > bestScore) bestScore = score;
          if (onMatch) onMatch(best.positions);
        }
      };

      tryField('title', fields.title, FIELD_WEIGHTS.title, (pos) => { matches.title = matches.title.concat(pos); });
      tryField('author', fields.author, FIELD_WEIGHTS.author, (pos) => { matches.author = matches.author.concat(pos); });
      tryField('pr', fields.pr, FIELD_WEIGHTS.pr, (pos) => { matches.pr = matches.pr.concat(pos); });
      tryField('source', fields.source, FIELD_WEIGHTS.source, (pos) => { matches.source = matches.source.concat(pos); });
      tryField('repo', fields.repo, FIELD_WEIGHTS.repo, (pos) => { matches.repo = matches.repo.concat(pos); });
      tryField('body', fields.body, FIELD_WEIGHTS.body, (pos) => { matches.body = matches.body.concat(pos); });

      // changes — по каждой записи отдельно, чтобы знать индекс для подсветки
      for (let ci = 0; ci < fields.changes.length; ci++) {
        const ch = fields.changes[ci];
        // type — точное совпадение (или prefix)
        let typeBest = null;
        for (const alt of token.alternatives) {
          const r = matchTokenToField(alt, ch.type, phraseOpts);
          if (r && (!typeBest || r.score > typeBest.score)) typeBest = r;
        }
        if (typeBest) {
          bestMatched = true;
          const score = typeBest.score * FIELD_WEIGHTS.type;
          if (score > bestScore) bestScore = score;
        }
        // text
        let textBest = null;
        for (const alt of token.alternatives) {
          const r = matchTokenToField(alt, ch.text, phraseOpts);
          if (r && (!textBest || r.score > textBest.score)) textBest = r;
        }
        if (textBest) {
          bestMatched = true;
          const score = textBest.score * FIELD_WEIGHTS.changes;
          if (score > bestScore) bestScore = score;
          matches.changes.push({ idx: ci, ranges: textBest.positions });
        }
      }

      return { matched: bestMatched, score: bestScore };
    }

    // Сопоставление токена в конкретном поле
    _matchTokenInField(token, fields, matches, fieldName) {
      let best = null;
      let fieldOpts;
      if (token.isPhrase) {
        fieldOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (token.negated) {
        fieldOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (!this.fuzzyEnabled) {
        fieldOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (fieldName === 'pr' || fieldName === 'source' || fieldName === 'type') {
        fieldOpts = { allowExact: true, allowFuzzy: false, allowSubsequence: false };
      } else if (fieldName === 'author') {
        fieldOpts = { allowExact: true, allowFuzzy: true, allowSubsequence: false };
      } else {
        fieldOpts = { allowExact: true, allowFuzzy: true, allowSubsequence: true };
      }

      if (fieldName === 'changes') {
        // Особый случай: ищем в changes.text
        for (let ci = 0; ci < fields.changes.length; ci++) {
          const ch = fields.changes[ci];
          for (const alt of token.alternatives) {
            const r = matchTokenToField(alt, ch.text, fieldOpts);
            if (r && (!best || r.score > best.score)) {
              best = { score: r.score * FIELD_WEIGHTS.changes, positions: r.positions, changeIdx: ci };
            }
          }
        }
        if (best) {
          matches.changes.push({ idx: best.changeIdx, ranges: best.positions });
          return { matched: true, score: best.score };
        }
        return { matched: false, score: 0 };
      }

      if (fieldName === 'type') {
        // Поиск по типу изменения (bugfix, rscadd, ...)
        for (let ci = 0; ci < fields.changes.length; ci++) {
          const ch = fields.changes[ci];
          for (const alt of token.alternatives) {
            const r = matchTokenToField(alt, ch.type, fieldOpts);
            if (r && (!best || r.score > best.score)) {
              best = { score: r.score * FIELD_WEIGHTS.type, positions: r.positions };
            }
          }
        }
        if (best) return { matched: true, score: best.score };
        return { matched: false, score: 0 };
      }

      const text = fields[fieldName];
      if (text === undefined || text === null) return { matched: false, score: 0 };
      const weight = FIELD_WEIGHTS[fieldName] || 1;

      for (const alt of token.alternatives) {
        const r = matchTokenToField(alt, text, fieldOpts);
        if (r && (!best || r.score > best.score)) {
          best = { score: r.score * weight, positions: r.positions };
        }
      }

      if (best) {
        if (matches[fieldName]) matches[fieldName] = matches[fieldName].concat(best.positions);
        return { matched: true, score: best.score };
      }
      return { matched: false, score: 0 };
    }
  }

  global.ChangelogSearch = ChangelogSearch;
  global.normalizeSearchString = normalize;
})(window);
