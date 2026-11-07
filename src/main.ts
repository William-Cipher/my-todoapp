import './style.css';

/* ------------------------------------------------------------------
 * 1. 数据与状态
 * ------------------------------------------------------------------ */

/** 一条待办。id 用时间戳，同一页面内够用。 */
interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

/** 视图筛选：只决定「显示哪些」，不属于任务数据本身。 */
type Filter = 'all' | 'active' | 'done';

const STORAGE_KEY = 'my-todoapp:todos';

let todos: Todo[] = [];
let filter: Filter = 'all';

/* ------------------------------------------------------------------
 * 2. 取元素
 *    querySelector 返回 Element | null，具体是输入框还是列表它不知道，
 *    所以要自己验一遍类型。
 *
 *    注意：不能只在顶层写 if (...) throw。收窄只在同一段代码里有效，
 *    到了 render()、addTodo() 这些函数体内部，类型又会退回去 ——
 *    实测会在 11 行上报「'listEl' / 'inputEl' is possibly 'null'」。
 *    所以把校验放进函数，让函数直接返回具体类型。
 * ------------------------------------------------------------------ */

function pick<T extends Element>(selector: string, ctor: new () => T): T {
  const el = document.querySelector(selector);
  if (!(el instanceof ctor)) throw new Error(`页面缺少元素：${selector}`);
  return el;
}

const inputEl = pick('#todo-input', HTMLInputElement);
const addBtn = pick('#add-btn', HTMLButtonElement);
const listEl = pick('#todo-list', HTMLUListElement);
const filterBox = pick('.filter-group', HTMLDivElement);

/* ------------------------------------------------------------------
 * 3. 持久化
 *    localStorage 里的内容完全不受控（可能是旧结构、也可能是手改的），
 *    所以读回来必须逐字段验，不能直接 JSON.parse 就当 Todo[] 用。
 * ------------------------------------------------------------------ */

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || !('text' in value) || !('completed' in value)) return false;
  return (
    typeof value.id === 'number' &&
    typeof value.text === 'string' &&
    typeof value.completed === 'boolean'
  );
}

function load(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      todos = parsed.filter((item: unknown): item is Todo => isTodo(item));
    }
  } catch {
    todos = [];
  }
}

function save(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

/* ------------------------------------------------------------------
 * 4. 渲染
 *    render() 是 todos 的「投影」：先把列表清空，再按当前状态重建。
 *    这样不需要手动同步 DOM，改了数据重画一遍即可。
 * ------------------------------------------------------------------ */

function visibleTodos(): Todo[] {
  if (filter === 'active') return todos.filter((t) => !t.completed);
  if (filter === 'done') return todos.filter((t) => t.completed);
  return todos;
}

function createItem(todo: Todo): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.id = String(todo.id);
  if (todo.completed) li.classList.add('done');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'toggle';
  box.checked = todo.completed;

  const text = document.createElement('span');
  text.className = 'text';
  // 用 textContent 而不是 innerHTML：文本里带 < > 也只是普通字符，不会被当成标签执行
  text.textContent = todo.text;

  const btn = document.createElement('button');
  btn.className = 'del-btn';
  btn.dataset.action = 'delete';
  btn.textContent = '删除';

  li.append(box, text, btn);
  return li;
}

function render(): void {
  listEl.replaceChildren();

  const items = visibleTodos();
  if (items.length === 0) {
    const tip = document.createElement('li');
    tip.className = 'empty';
    tip.textContent = filter === 'all' ? '还没有任务，先添加一条试试' : '当前筛选下没有任务';
    listEl.append(tip);
    return;
  }

  for (const todo of items) {
    listEl.append(createItem(todo));
  }
}

/* ------------------------------------------------------------------
 * 5. 三个动作：加、删、切
 *    统一写成「改数据 → save() → render()」，顺序固定，不容易漏。
 * ------------------------------------------------------------------ */

function addTodo(raw: string): void {
  const clean = raw.trim();
  if (clean === '') {
    inputEl.focus();
    return;
  }
  todos = [...todos, { id: Date.now(), text: clean, completed: false }];
  save();
  render();
}

function removeTodo(id: number): void {
  todos = todos.filter((t) => t.id !== id);
  save();
  render();
}

function toggleTodo(id: number): void {
  todos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
  save();
  render();
}

/* ------------------------------------------------------------------
 * 6. 事件绑定
 *    列表用「事件委托」：只在 ul 上挂一个监听器，动态生成的 li 不必各自绑定。
 * ------------------------------------------------------------------ */

function submit(): void {
  addTodo(inputEl.value);
  inputEl.value = '';
  inputEl.focus();
}

addBtn.addEventListener('click', submit);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit();
});

listEl.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;

  const li = e.target.closest('li');
  if (li === null || !listEl.contains(li)) return;

  // dataset 里的值永远是字符串，转成数字后再验一遍是否为安全整数
  const id = Number(li.dataset.id);
  if (!Number.isSafeInteger(id)) return;

  if (e.target.closest('[data-action="delete"]') !== null) {
    removeTodo(id);
    return;
  }
  toggleTodo(id);
});

filterBox.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;

  const btn = e.target.closest('[data-filter]');
  if (btn === null || !filterBox.contains(btn)) return;

  // 不用 as 硬转：逐个比对字面量，类型自然就窄化成 Filter
  const value = btn.getAttribute('data-filter');
  if (value !== 'all' && value !== 'active' && value !== 'done') return;
  filter = value;

  for (const b of filterBox.querySelectorAll('button')) {
    b.classList.toggle('active', b === btn);
  }
  render();
});

/* ------------------------------------------------------------------
 * 7. 启动
 * ------------------------------------------------------------------ */

load();
render();
