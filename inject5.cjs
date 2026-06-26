const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(appFile, 'utf8');

const printableStockFormComp = `
const PrintableStockForm = ({ products, settings }) => {
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
};
`;

const compTarget = `const ProductPanel =`;
content = content.replace(compTarget, printableStockFormComp + '\n    ' + compTarget);

const stateTarget = `const [showAddProduct, setShowAddProduct] = useState(false);`;
const stateInjection = `const [showAddProduct, setShowAddProduct] = useState(false); const [isPrintingStockForm, setIsPrintingStockForm] = useState(false);`;
content = content.replace(stateTarget, stateInjection);

const buttonTarget = `<button onClick={(e) => { e.stopPropagation(); setShowAttractMode(true) }} className="btn-primary bg-purple-600 hover:bg-purple-700 px-4 py-2"><Play className="w-4 h-4" /> Attract Mode</button>`;
const buttonInjection = `<button onClick={(e) => { e.stopPropagation(); setShowAttractMode(true) }} className="btn-primary bg-purple-600 hover:bg-purple-700 px-4 py-2"><Play className="w-4 h-4" /> Attract Mode</button>
            {role === 'owner' && <button onClick={() => { setIsPrintingStockForm(true); setTimeout(() => { window.print(); setIsPrintingStockForm(false); }, 200); }} className="btn-primary bg-slate-800 hover:bg-slate-900 px-4 py-2"><Printer className="w-4 h-4" /> Print Stock Form</button>}`;
content = content.replace(buttonTarget, buttonInjection);

const portalTarget = `return (<div className="space-y-6 pb-20">`;
const portalInjection = `return (<div className="space-y-6 pb-20">
        {isPrintingStockForm && createPortal(<PrintableStockForm products={products} settings={settings} />, document.getElementById('print-area'))}`;
content = content.replace(portalTarget, portalInjection);

fs.writeFileSync(appFile, content);
console.log('Done');
