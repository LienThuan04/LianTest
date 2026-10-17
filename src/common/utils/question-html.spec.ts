const escapeQuestionHtml = jest.requireActual<(value: unknown) => string>(
  '../../../public/js/question-html.js',
);

describe('Question preview HTML encoding', () => {
  it('preserves quoted questions inside input attribute values', () => {
    const html = `<input value="${escapeQuestionHtml('What does "x" mean?')}">`;
    expect(html).toBe('<input value="What does &quot;x&quot; mean?">');
  });

  it('keeps uploaded attribute-like text as data instead of event handlers', () => {
    expect(escapeQuestionHtml('" autofocus onfocus="alert(1)')).toBe(
      '&quot; autofocus onfocus=&quot;alert(1)',
    );
    expect(escapeQuestionHtml("' onfocus='alert(1)")).toBe(
      '&#39; onfocus=&#39;alert(1)',
    );
  });

  it('escapes markup and ampersands while preserving Vietnamese and line breaks', () => {
    expect(escapeQuestionHtml('<script> & Câu hỏi\nTiếp theo')).toBe(
      '&lt;script&gt; &amp; Câu hỏi\nTiếp theo',
    );
    expect(escapeQuestionHtml(null)).toBe('');
    expect(escapeQuestionHtml(0)).toBe('0');
  });
});
