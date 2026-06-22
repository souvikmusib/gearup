import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AMC Members Save More | GearUp Servicing',
  description: 'Exclusive discounts on spare parts, engine oil, chain cleaner & chain lube for AMC members at GearUp Servicing, Bankura.',
  openGraph: {
    title: 'AMC Members Save More | GearUp Servicing',
    description: 'Save up to 35% on spare parts & accessories with GearUp AMC membership.',
  },
};

const products = [
  { name: 'Hero Spare Parts', regular: '4%', amc: '7%' },
  { name: 'Honda Spare Parts', regular: '3%', amc: '6%' },
  { name: 'Bajaj Spare Parts', regular: '5%', amc: '8%' },
  { name: 'TVS Spare Parts', regular: '5%', amc: '8%' },
  { name: 'Yamaha Spare Parts', regular: '2%', amc: '5%' },
  { name: 'Royal Enfield Spare Parts', regular: '3%', amc: '6%' },
  { name: 'RE Engine Oil', regular: '8%', amc: '11%' },
  { name: 'Studds / Steelbird', regular: '14%', amc: '17%' },
  { name: 'Non-Branded Parts & Accessories', regular: '30%', amc: '35%' },
  { name: 'Motul Chain Lube (150ml / 400ml)', regular: '3%', amc: '6%' },
  { name: 'Motul Chain Cleaner (150ml)', regular: '3%', amc: '6%' },
  { name: 'Motul DOT 4 Brake Oil', regular: '3%', amc: '6%' },
  { name: 'Motul Front Fork Oil (175ml / 350ml)', regular: '3%', amc: '6%' },
  { name: 'Motul Electrical Cleaner (400ml)', regular: '7%', amc: '10%' },
];

export default function AmcPage() {
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-[600px] bg-white rounded-lg overflow-hidden shadow-2xl">
        {/* Top accent */}
        <div className="h-[5px] bg-gradient-to-r from-red-600 via-red-500 to-green-600" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <img src="/brand/gearup.svg" alt="Gear Up" className="h-11" />
          <div className="text-right text-[9px] text-gray-600 leading-relaxed">
            <div>📍 Milanpally, Katjuridanga, Bankura</div>
            <div>📞 9242519099 &nbsp; ✉️ gearup.sgnk.ai@gmail.com</div>
            <div><b>GSTIN:</b> 19EHTPM1499B1ZS</div>
          </div>
        </div>

        {/* Hero */}
        <div className="relative bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-6 py-5 text-center overflow-hidden">
          <div className="absolute -top-8 -right-8 w-36 h-36 border-[20px] border-white/[0.03] rounded-full" />
          <div className="absolute -bottom-5 -left-5 w-24 h-24 border-[15px] border-green-500/10 rounded-full" />
          <h1 className="relative z-10 text-[28px] font-extrabold text-white tracking-wide">
            AMC MEMBERS{' '}
            <span className="bg-gradient-to-br from-red-500 to-red-700 px-3 py-0.5 rounded-md shadow-lg shadow-red-500/30 inline-block">
              SAVE MORE!
            </span>
          </h1>
          <p className="relative z-10 text-[11px] text-white/70 mt-2 italic font-medium">
            Exclusive Discounts on Spare Parts, Engine Oil, Chain Cleaner &amp; Chain Lube
          </p>
        </div>

        {/* Table */}
        <div className="px-4 py-2">
          <table className="w-full text-[10.5px] rounded-lg overflow-hidden shadow-sm">
            <thead>
              <tr>
                <th className="bg-[#1e293b] text-white text-left pl-3 py-2 font-bold uppercase text-[9px] tracking-wide w-[44%]">Product</th>
                <th className="bg-gradient-to-br from-red-600 to-red-700 text-white text-center py-2 font-bold uppercase text-[8.5px] w-[28%]">
                  Regular Customer<span className="block text-[7.5px] font-medium opacity-90">(Pay More) ❌</span>
                </th>
                <th className="bg-gradient-to-br from-green-600 to-green-700 text-white text-center py-2 font-bold uppercase text-[8.5px] w-[28%]">
                  AMC Customer<span className="block text-[7.5px] font-medium opacity-90">(Save More) ✅</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={p.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="pl-3 py-[5px] font-semibold text-[10px] text-gray-800">{p.name}</td>
                  <td className="text-center font-extrabold text-red-600 text-[12.5px]">{p.regular}</td>
                  <td className="text-center font-extrabold text-green-600 text-[12.5px]">{p.amc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Comparison */}
        <div className="px-4 py-2 flex gap-2">
          <div className="flex-1 border border-red-200 bg-red-50 rounded-lg p-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-red-600" />
            <div className="flex items-center gap-2 mt-1 mb-1">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">✗</span>
              <span className="text-[9px] font-extrabold text-gray-800 uppercase">Regular Customer</span>
            </div>
            <div className="text-[8.5px] font-bold text-red-600 mb-1">Pay More · Get Less</div>
            <ul className="text-[8px] text-gray-600 font-semibold space-y-0.5">
              <li>❌ Higher prices on every purchase</li>
              <li>❌ No extra benefits</li>
              <li>❌ More cost, more burden</li>
            </ul>
          </div>
          <div className="flex-1 border border-green-200 bg-green-50 rounded-lg p-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-green-600" />
            <div className="flex items-center gap-2 mt-1 mb-1">
              <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center">✓</span>
              <span className="text-[9px] font-extrabold text-gray-800 uppercase">Be an AMC Customer</span>
            </div>
            <div className="text-[8.5px] font-bold text-green-600 mb-1">Save More · Get Better Service</div>
            <ul className="text-[8px] text-gray-600 font-semibold space-y-0.5">
              <li>✅ Lower prices on every purchase</li>
              <li>✅ Priority Workshop Service</li>
              <li>✅ More savings, better experience</li>
            </ul>
          </div>
        </div>

        {/* Why Choose AMC */}
        <div className="px-4 py-2 text-center">
          <h3 className="text-[12px] font-extrabold text-gray-900 mb-2 tracking-wide">WHY CHOOSE AMC?</h3>
          <div className="flex gap-1.5">
            {[
              { emoji: '🏷️', label: 'Extra Discount\non Every Purchase' },
              { emoji: '⚡', label: 'Priority\nWorkshop Service' },
              { emoji: '🔧', label: 'Lower\nMaintenance Cost' },
              { emoji: '🛡️', label: 'Exclusive\nMember Benefits' },
              { emoji: '💰', label: 'More Savings\nAll Year' },
            ].map((item) => (
              <div key={item.emoji} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg py-2 px-1">
                <div className="text-[16px] mb-1">{item.emoji}</div>
                <div className="text-[7px] font-bold text-gray-700 leading-tight whitespace-pre-line">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="relative bg-gradient-to-br from-[#0d1b0f] via-[#145a1e] to-[#1a6b2a] px-6 py-4 text-center mt-auto">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400" />
          <h2 className="text-[20px] font-extrabold text-white tracking-wide">
            ✅ JOIN AMC TODAY &amp; SAVE UP TO <span className="text-yellow-400 text-[28px]">35%</span>
          </h2>
          <p className="text-[9px] text-green-200 tracking-[3px] mt-1 font-bold">SAVE MORE. RIDE MORE. STRESS LESS.</p>
        </div>
      </div>
    </div>
  );
}
