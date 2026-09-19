// Run with node scripts/catalog-regression.cjs. Exercise the real catalog
// hook and offer models with a deterministic hook scheduler and packet bus.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let slots, cursor, effects, dirty, state;
const packets = [], handlers = new Map();
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
    useState(initial) {
        const index = cursor++;
        if(!slots[index]) {
            const entry = { value: initial };
            entry.set = next => {
                next = typeof next === 'function' ? next(entry.value) : next;
                if(!Object.is(next, entry.value)) { entry.value = next; dirty = true; }
            };
            slots[index] = entry;
        }
        return [slots[index].value, slots[index].set];
    },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useCallback(value, deps) {
        const index = cursor++;
        if(!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value, deps };
        return slots[index].value;
    },
    useEffect(fn, deps) {
        const index = cursor++;
        if(!slots[index] || !same(slots[index].deps, deps)) {
            const old = slots[index];
            slots[index] = { deps };
            effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); });
        }
    },
    useMemo(fn, deps) { return this.useCallback(fn, deps)(); }
};
react.useMemo = (fn, deps) => react.useCallback(fn, deps)();
const renderer = new Proxy({}, { get(target, key) {
    return target[key] ??= class { static key = key; constructor(...args) { this.args = args; } };
} });
const api = { GetRoomEngine: () => ({}), GetProductDataForLocalization: () => null,
    GetFurnitureData: () => null, SendMessageComposer: packet => packets.push(packet), LocalizeText: key => key };
const cache = new Map();
function load(file) {
    file = path.resolve(__dirname, '..', file);
    if(cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX
    } }).outputText;
    const requireMock = name => {
        if(name === 'react') return react;
        if(name === 'react/jsx-runtime') return { jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props}) };
        if(name === '@nitrots/nitro-renderer') return renderer;
        if(name === 'use-between') return { useBetween: fn => fn() };
        if(name.endsWith('/api') || name === '..' || name.endsWith('/nitro')) return api;
        if(name === '../events') return { useMessageEvent: (type, fn) => handlers.set(type.key, fn), useRoomEngineEvent() {}, useUiEvent() {} };
        if(name === '../../events') return renderer;
        if(name === '../notification') return { useNotification: () => ({}) };
        if(name.includes('useCatalogPlaceMultipleItems')) return { useCatalogPlaceMultipleItems: () => [false, () => {}] };
        if(name.includes('useCatalogSkipPurchaseConfirmation')) return { useCatalogSkipPurchaseConfirmation: () => [false, () => {}] };
        if(name.includes('RpRoomRightsMessages')) return {};
        if(name.endsWith('/hooks')) return { useCatalog: () => state };
        if(name.endsWith('/common')) return {};
        if(name === './CatalogUtilities') return {};
        const resolved = path.resolve(path.dirname(file), name + '.ts');
        return load(resolved);
    };
    vm.runInNewContext(code, { exports, require: requireMock, console, setTimeout, clearTimeout }, { filename: file });
    return exports;
}
for(const model of ['ProductTypeEnum', 'Product', 'Offer', 'CatalogPage', 'CatalogNode', 'CatalogType', 'PageLocalization', 'RequestedPage'])
    Object.assign(api, load(`src/api/catalog/${model}.ts`));
const { useCatalog } = load('src/hooks/catalog/useCatalog.ts');
const { CatalogSpinnerWidgetView: spinner } = load('src/components/catalog/views/page/widgets/CatalogSpinnerWidgetView.tsx');
function render() {
    let attempts = 0;
    do {
        assert.ok(++attempts < 30, 'hook effects settle');
        dirty = false; cursor = 0; effects = [];
        state = useCatalog(); effects.forEach(fn => fn());
    } while(dirty);
    return state;
}
function reset() { slots = []; packets.length = 0; handlers.clear(); render(); }
function receive(name, data) { handlers.get(name)({getParser: () => data}); render(); }
function offer(id, overrides = {}) {
    return { offerId: id, localizationId: 'chair', rent: false, priceCredits: 5, priceActivityPoints: 0,
        priceActivityPointsType: 0, giftable: true, clubLevel: 0, bundlePurchaseAllowed: true,
        products: [{ productType: 's', furniClassId: 42, extraParam: '', productCount: 1, uniqueLimitedItem: false }], ...overrides };
}
function page(id, selected, offers) {
    return { pageId: id, offerId: selected, offers, catalogType: 'NORMAL', layoutCode: 'default_3x3',
        localization: {images: [], texts: []}, acceptSeasonCurrencyAsCredits: false };
}
function search() { state.setSearchResult({}); state.setCurrentPage(new api.CatalogPage(-1, 'default_3x3', null, [], false)); render(); }
function hit(id, pageId = 50) { return { offerId: id, page: {pageId} }; }
function quantityVisible() {
    const old = slots; slots = []; cursor = 0; effects = [];
    const result = spinner({}); slots = old;
    return result !== null;
}

reset(); search(); state.requestSearchOffer(hit(7)); render();
assert.equal(state.currentOffer, null, 'no purchase while details are pending');
receive('CatalogPageMessageEvent', page(50, 7, [offer(7)]));
assert.equal(state.currentPage.pageId, -1, 'search grid stays open');
assert.equal(state.currentOffer.page.pageId, 50, 'purchase uses real shelf');
assert.ok(quantityVisible(), 'ordinary search result supports multiple');
state.requestSearchOffer(hit(12)); render();
receive('CatalogPageMessageEvent', page(50, 12, [offer(12, {products: [
    { productType: 'i', furniClassId: 42, extraParam: 'pattern-3', productCount: 1 }
]})]));
assert.ok(quantityVisible(), 'ordinary wall furniture supports multiple');
assert.equal(state.purchaseOptions.extraData, 'pattern-3', 'wall variant survives purchase option reset');

for(const restricted of [
    offer(8, {bundlePurchaseAllowed: false}),
    offer(8, {products: [{ productType: 's', furniClassId: 42, productCount: 2 }]}),
    offer(8, {products: [{ productType: 's', furniClassId: 42, productCount: 1, uniqueLimitedItem: true,
        uniqueLimitedSeriesSize: 10, uniqueLimitedItemsLeft: 0 }]})
]) {
    state.requestSearchOffer(hit(8)); render(); receive('CatalogPageMessageEvent', page(50, 8, [restricted]));
    assert.equal(quantityVisible(), false, 'restricted offers keep quantity hidden');
}
state.requestSearchOffer(hit(9)); render(); state.requestSearchOffer(hit(10)); render();
receive('CatalogPageMessageEvent', page(50, 9, [offer(9)]));
assert.equal(state.currentOffer, null, 'late response cannot select previous item');
receive('CatalogPageMessageEvent', page(50, 10, [offer(10)]));
assert.equal(state.currentOffer.offerId, 10);
state.requestSearchOffer(hit(11)); render(); search();
receive('CatalogPageMessageEvent', page(50, 11, [offer(11)]));
assert.notEqual(state.currentOffer?.offerId, 11, 'old query cannot select into new results');

reset(); state.openPageById(50, 7); render();
const node = (pageId, pageName, children = []) => ({pageId, pageName, children, offerIds: [], visible: true});
receive('CatalogPagesListEvent', {root: node(-1, 'root', [node(50, 'furni', [node(51, 'child')])])});
const request = packets.filter(p => p.constructor.key === 'GetCatalogPageComposer').at(-1);
assert.equal(request.args[0], 50, 'direct link keeps parent page with stock');
assert.equal(request.args[1], 7, 'selection survives first catalog open');
receive('CatalogPageMessageEvent', page(50, 7, [offer(7)]));
assert.equal(state.currentOffer.offerId, 7, 'page change does not erase selected item');
assert.ok(quantityVisible());
search(); state.openPageById(51, 8); render();
const fromSearch = packets.filter(p => p.constructor.key === 'GetCatalogPageComposer').at(-1);
assert.equal(fromSearch.args[0], 51, 'Buy from an open search must not bounce to the previous page');
assert.equal(fromSearch.args[1], 8, 'default-page loading must not replace the requested selection');
receive('CatalogPageMessageEvent', page(51, 8, [offer(8)]));
assert.equal(state.currentPage.pageId, 51);
assert.equal(state.currentOffer.offerId, 8);
state.openPageById(50); render(); search();
receive('CatalogPageMessageEvent', page(50, -1, [offer(7)]));
assert.equal(state.currentPage.pageId, -1, 'late navigation response preserves newer search');
assert.equal(state.isBusy, false, 'late response does not leave the catalog permanently busy');
// Navigating to a category twice folds it away - that is the sidebar's toggle.
// Arriving with an item to select is not a second click, so Buy on furni sold
// from the page already open must leave the branch standing.
reset(); state.setIsVisible(true); render();
receive('CatalogPagesListEvent', {root: node(-1, 'root', [node(50, 'furni', [node(51, 'child')])])});
const branch = state.getNodeById(51, state.rootNode);
assert.ok(branch.isOpen, 'the catalog lands on a category with it open');
state.activateNode(branch, 7); render();
assert.ok(branch.isOpen, 'Buy into the category already open keeps it open');
assert.equal(packets.filter(p => p.constructor.key === 'GetCatalogPageComposer').at(-1).args[1], 7, 'Buy still asks for its item');
state.activateNode(branch); render();
assert.equal(branch.isOpen, false, 'plain navigation still toggles the category shut');

console.log('Catalog regressions passed: search quantities, restrictions, stale replies, first-open navigation, item selection and Buy-into-open-category.');
