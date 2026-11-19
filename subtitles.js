function stamp(seconds) {
  return new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23).replace('.', ',');
}
export function subtitles(cues, start, end) {
  return cues.filter(c => c.end > start && c.start < end).map((c, i) => {
    const from = stamp(Math.max(start, c.start) - start);
    const to = stamp(Math.min(end, c.end) - start);
    return [i + 1, from + ' --> ' + to, c.text.replace(/[<>{}]/g, ''), ''].join('\n');
  }).join('\n');
}
