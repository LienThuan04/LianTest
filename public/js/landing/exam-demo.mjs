// @ts-check
import { demoQuestions, calculateDemoResult } from './exam-demo-data.mjs';

const root = document.querySelector('[data-demo]');
if (root instanceof HTMLElement) {
  /** @type {(number|null)[]} */
  let answers = demoQuestions.map(() => null);
  let currentIndex = 0;
  let submitted = false;
  const questionArea = root.querySelector('[data-demo-question]');
  const resultArea = root.querySelector('[data-demo-result]');
  const status = root.querySelector('[data-demo-status]');
  const progress = root.querySelector('[data-demo-progress]');
  const previous = root.querySelector('[data-demo-previous]');
  const next = root.querySelector('[data-demo-next]');
  const submit = root.querySelector('[data-demo-submit]');
  const restart = root.querySelector('[data-demo-restart]');

  function render() {
    if (!(questionArea instanceof HTMLElement) || !(resultArea instanceof HTMLElement)) return;
    const question = demoQuestions[currentIndex];
    if (status) status.textContent = submitted ? 'Đã hoàn thành bài minh họa' : `Câu ${currentIndex + 1} / ${demoQuestions.length} · Đã chọn ${answers.filter(value => value !== null).length} câu`;
    if (progress instanceof HTMLProgressElement) progress.value = submitted ? demoQuestions.length : answers.filter(value => value !== null).length;
    questionArea.hidden = submitted;
    resultArea.hidden = !submitted;
    if (previous instanceof HTMLButtonElement) { previous.disabled = currentIndex === 0; previous.hidden = submitted; }
    if (next instanceof HTMLButtonElement) next.hidden = submitted || currentIndex === demoQuestions.length - 1;
    if (submit instanceof HTMLButtonElement) submit.hidden = submitted || currentIndex !== demoQuestions.length - 1;
    if (restart instanceof HTMLButtonElement) restart.hidden = !submitted;
    if (submitted) {
      const result = calculateDemoResult(answers);
      resultArea.replaceChildren();
      const title = document.createElement('h3');
      title.textContent = `${result.correct} / ${result.total} câu đúng`;
      resultArea.append(title);
      demoQuestions.forEach((item, index) => {
        const review = document.createElement('p');
        const label = answers[index] === item.correctIndex ? 'Đúng' : answers[index] === null ? 'Chưa trả lời' : 'Chưa đúng';
        review.textContent = `Câu ${index + 1} — ${label}. ${item.explanation}`;
        resultArea.append(review);
      });
      return;
    }
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.tabIndex = -1;
    legend.textContent = question.prompt;
    fieldset.append(legend);
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'demo-option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'demo-answer'; input.value = String(optionIndex);
      input.checked = answers[currentIndex] === optionIndex;
      input.addEventListener('change', () => {
        answers[currentIndex] = optionIndex;
        if (status) status.textContent = `Câu ${currentIndex + 1} / ${demoQuestions.length} · Đã chọn ${answers.filter(value => value !== null).length} câu`;
        if (progress instanceof HTMLProgressElement) progress.value = answers.filter(value => value !== null).length;
      });
      const text = document.createElement('span'); text.textContent = option;
      label.append(input, text); fieldset.append(label);
    });
    questionArea.replaceChildren(fieldset);
  }
  function focusQuestion() { root?.querySelector('legend')?.focus(); }
  previous?.addEventListener('click', () => { currentIndex = Math.max(0, currentIndex - 1); render(); focusQuestion(); });
  next?.addEventListener('click', () => { currentIndex = Math.min(demoQuestions.length - 1, currentIndex + 1); render(); focusQuestion(); });
  submit?.addEventListener('click', () => { submitted = true; render(); if (resultArea instanceof HTMLElement) resultArea.focus(); });
  restart?.addEventListener('click', () => { answers = demoQuestions.map(() => null); currentIndex = 0; submitted = false; render(); focusQuestion(); });
  render();
}
