const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Update PrintableStockForm
const oldPrintableStockForm = `const PrintableStockForm = ({ products, settings }) => {
  // Pad with empty rows to reach a minimum of 100
  const rows = [...products];
  while (rows.length < 100) {
    rows.push({ id: crypto.randomUUID(), name: '', category: '', barcode: '', isBlank: true });
  }

  return (
    <div className="bg-white text-black p-8 font-sans w-full mx-auto" style={{ maxWidth: '210mm' }}>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-widest">{settings?.name || 'Store'}</h1>
        <h2 className="text-xl font-semibold mt-2 text-slate-600">Inventory Checklist</h2>
        <p className="text-sm text-slate-500 mt-1">Date: {new Date().toLocaleDateString()}</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 print:bg-slate-100">
            <th className="border border-slate-400 p-2 text-left w-8">#</th>
            <th className="border border-slate-400 p-2 text-left">Product Name</th>
            <th className="border border-slate-400 p-2 text-left w-32">Category</th>
            <th className="border border-slate-400 p-2 text-left w-32">Barcode</th>
            <th className="border border-slate-400 p-2 text-left w-24">Cost</th>
            <th className="border border-slate-400 p-2 text-left w-24">Price</th>
            <th className="border border-slate-400 p-2 text-left w-24">Physical Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id || i}>
              <td className="border border-slate-400 p-2 text-center text-slate-500">{i + 1}</td>
              <td className="border border-slate-400 p-2 font-medium">{p.name || ''}</td>
              <td className="border border-slate-400 p-2 text-xs">{p.category || ''}</td>
              <td className="border border-slate-400 p-2 text-xs font-mono">{p.barcode || ''}</td>
              <td className="border border-slate-400 p-2"></td>
              <td className="border border-slate-400 p-2"></td>
              <td className="border border-slate-400 p-2"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};`;

const newPrintableStockForm = `const PrintableStockForm = ({ products, settings }) => {
  const rows = [...products];
  const itemsPerPage = 50;
  
  // Ensure we have at least enough rows to fill the last page, or a minimum of 50
  const remainder = rows.length % itemsPerPage;
  let rowsToAdd = remainder === 0 && rows.length > 0 ? 0 : itemsPerPage - remainder;
  if (rows.length === 0) rowsToAdd = itemsPerPage;
  
  for (let i = 0; i < rowsToAdd; i++) {
    rows.push({ id: crypto.randomUUID(), name: '', category: '', barcode: '', isBlank: true });
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += itemsPerPage) {
    chunks.push(rows.slice(i, i + itemsPerPage));
  }

  return (
    <div className="bg-white text-black font-sans w-full mx-auto" style={{ maxWidth: '210mm' }}>
      {chunks.map((chunk, chunkIdx) => (
        <div key={chunkIdx} className="p-8 break-after-page">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold uppercase tracking-widest">{settings?.name || 'Store'}</h1>
            <h2 className="text-xl font-semibold mt-2 text-slate-600">Inventory Checklist (Page {chunkIdx + 1} / {chunks.length})</h2>
            <p className="text-sm text-slate-500 mt-1">Date: {new Date().toLocaleDateString()}</p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 print:bg-slate-100">
                <th className="border border-slate-400 p-2 text-left w-8">#</th>
                <th className="border border-slate-400 p-2 text-left">Product Name</th>
                <th className="border border-slate-400 p-2 text-left w-32">Category</th>
                <th className="border border-slate-400 p-2 text-left w-32">Barcode</th>
                <th className="border border-slate-400 p-2 text-left w-24">Cost</th>
                <th className="border border-slate-400 p-2 text-left w-24">Price</th>
                <th className="border border-slate-400 p-2 text-left w-24">Physical Stock</th>
              </tr>
            </thead>
            <tbody>
              {chunk.map((p, indexInChunk) => {
                const absoluteIndex = chunkIdx * itemsPerPage + indexInChunk + 1;
                return (
                  <tr key={p.id || absoluteIndex}>
                    <td className="border border-slate-400 p-1 text-center text-slate-500">{absoluteIndex}</td>
                    <td className="border border-slate-400 p-1 font-medium">{p.name || ''}</td>
                    <td className="border border-slate-400 p-1 text-xs">{p.category || ''}</td>
                    <td className="border border-slate-400 p-1 text-xs font-mono">{p.barcode || ''}</td>
                    <td className="border border-slate-400 p-1"></td>
                    <td className="border border-slate-400 p-1"></td>
                    <td className="border border-slate-400 p-1"></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};`;

if (content.includes(oldPrintableStockForm)) {
  content = content.replace(oldPrintableStockForm, newPrintableStockForm);
} else {
  console.log("Could not find oldPrintableStockForm to replace.");
}

// 2. Remove state from ProductPanel
const productPanelStateToFind = `const [showAddProduct, setShowAddProduct] = useState(false); const [isPrintingStockForm, setIsPrintingStockForm] = useState(false);`;
const productPanelStateReplacement = `const [showAddProduct, setShowAddProduct] = useState(false);`;
if (content.includes(productPanelStateToFind)) {
  content = content.replace(productPanelStateToFind, productPanelStateReplacement);
} else {
  console.log("Could not find ProductPanel state to replace.");
}

// 3. Remove portal from ProductPanel
const portalToFind = `        {isPrintingStockForm && createPortal(<PrintableStockForm products={products} settings={settings} />, document.getElementById('print-area'))}`;
if (content.includes(portalToFind)) {
  content = content.replace(portalToFind, "");
} else {
  console.log("Could not find portal in ProductPanel.");
}

// 4. Remove button from ProductPanel
const productButtonToFind = `            {role === 'owner' && <button onClick={() => { setIsPrintingStockForm(true); setTimeout(() => { window.print(); setIsPrintingStockForm(false); }, 200); }} className="btn-primary bg-slate-800 hover:bg-slate-900 px-4 py-2"><Printer className="w-4 h-4" /> Print Stock Form</button>}`;
if (content.includes(productButtonToFind)) {
  content = content.replace(productButtonToFind, "");
} else {
  console.log("Could not find button in ProductPanel.");
}

// 5. Add state and portal, and button to SummaryPanel
const summaryPanelStart = `const SummaryPanel = ({ products, salesHistory, setSalesHistory, expenses, debts, settings, stockHistory, setStockHistory, currentUser, onCancelSale }) => {`;
const summaryPanelStartReplacement = `const SummaryPanel = ({ products, salesHistory, setSalesHistory, expenses, debts, settings, stockHistory, setStockHistory, currentUser, onCancelSale }) => {
      const [isPrintingStockForm, setIsPrintingStockForm] = useState(false);`;
if (content.includes(summaryPanelStart)) {
  content = content.replace(summaryPanelStart, summaryPanelStartReplacement);
} else {
  console.log("Could not find SummaryPanel start.");
}

const summaryPanelEndToFind = `</HistoryModal>)}</div>);`;
const summaryPanelEndReplacement = `</HistoryModal>)}
        {currentUser?.role === 'owner' && (
          <div className="mt-8 flex justify-center border-t border-slate-200 pt-6">
            <button 
              onClick={() => { setIsPrintingStockForm(true); setTimeout(() => { window.print(); setIsPrintingStockForm(false); }, 200); }} 
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl shadow-lg shadow-slate-200 font-bold transition-all transform hover:scale-105"
            >
              <Printer className="w-5 h-5" /> 
              Print Full Inventory Stock Form
            </button>
          </div>
        )}
        {isPrintingStockForm && createPortal(<PrintableStockForm products={products} settings={settings} />, document.getElementById('print-area'))}
      </div>);`;
if (content.includes(summaryPanelEndToFind)) {
  content = content.replace(summaryPanelEndToFind, summaryPanelEndReplacement);
} else {
  console.log("Could not find SummaryPanel end.");
}

fs.writeFileSync(appFile, content);
console.log('Script completed.');
