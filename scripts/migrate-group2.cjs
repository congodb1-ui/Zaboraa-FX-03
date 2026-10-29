const fs = require('fs');

const group2Files = [
  'src/components/OptimizationView.tsx',
  'src/components/PineConverterView.tsx',
  'src/components/StrategyStudioView.tsx',
  'src/components/BacktestView.tsx',
];

for (const file of group2Files) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, 'utf-8');

  // Double dark/light patterns
  c = c.replace(/text-emerald-[3-7]00\s+dark:text-emerald-[3-7]00/g, 'text-success');
  c = c.replace(/text-rose-[3-7]00\s+dark:text-rose-[3-7]00/g, 'text-danger');
  c = c.replace(/text-indigo-[3-7]00\s+dark:text-indigo-[3-7]00/g, 'text-primary');
  c = c.replace(/text-blue-[3-7]00\s+dark:text-blue-[3-7]00/g, 'text-primary');

  // Primary colors (indigo & blue & violet & cyan & purple)
  c = c.replace(/\btext-(indigo|blue|violet|purple|cyan)-[3-7]00\b/g, 'text-primary');
  c = c.replace(/\btext-(indigo|blue)-[1-2]00\b/g, 'text-primary');
  c = c.replace(/\btext-(indigo|blue)-[8-9]00\b/g, 'text-primary');
  c = c.replace(/\bbg-(indigo|blue|violet)-[5-7]00\b/g, 'bg-primary');
  c = c.replace(/\bbg-(indigo|blue|violet)-[5-7]00\/([0-9]+)\b/g, 'bg-primary/$2');
  c = c.replace(/\bhover:bg-(indigo|blue|violet)-[5-7]00\b/g, 'hover:brightness-110');
  c = c.replace(/\bborder-(indigo|blue|violet)-[4-7]00\/([0-9]+)\b/g, 'border-primary/$2');
  c = c.replace(/\bborder-(indigo|blue|violet)-[4-7]00\b/g, 'border-primary');
  c = c.replace(/\bshadow-(indigo|blue)-[5-7]00\/([0-9]+)\b/g, 'shadow-primary/$2');
  c = c.replace(/\bring-(indigo|blue)-[4-6]00\b/g, 'ring-primary');
  c = c.replace(/\bbg-(indigo|blue)-50\b/g, 'bg-primary/10');
  c = c.replace(/\bbg-(indigo|blue)-100\b/g, 'bg-primary/20');

  // Success colors (emerald & green)
  c = c.replace(/\btext-(emerald|green)-[1-9]00\b/g, 'text-success');
  c = c.replace(/\bbg-(emerald|green)-[5-7]00\b/g, 'bg-success');
  c = c.replace(/\bbg-(emerald|green)-[4-7]00\/([0-9]+)\b/g, 'bg-success/$2');
  c = c.replace(/\bhover:bg-(emerald|green)-[5-7]00\b/g, 'hover:brightness-110');
  c = c.replace(/\bborder-(emerald|green)-[4-7]00\/([0-9]+)\b/g, 'border-success/$2');
  c = c.replace(/\bborder-(emerald|green)-[4-7]00\b/g, 'border-success');
  c = c.replace(/\bbg-(emerald|green)-50\b/g, 'bg-success/10');
  c = c.replace(/\bbg-(emerald|green)-100\b/g, 'bg-success/20');

  // Danger colors (rose & red)
  c = c.replace(/\btext-(rose|red)-[1-9]00\b/g, 'text-danger');
  c = c.replace(/\bbg-(rose|red)-[5-7]00\b/g, 'bg-danger');
  c = c.replace(/\bbg-(rose|red)-[4-7]00\/([0-9]+)\b/g, 'bg-danger/$2');
  c = c.replace(/\bhover:bg-(rose|red)-[5-7]00\b/g, 'hover:brightness-110');
  c = c.replace(/\bborder-(rose|red)-[4-7]00\/([0-9]+)\b/g, 'border-danger/$2');
  c = c.replace(/\bborder-(rose|red)-[4-7]00\b/g, 'border-danger');
  c = c.replace(/\bshadow-(rose|red)-[5-7]00\/([0-9]+)\b/g, 'shadow-danger/$2');
  c = c.replace(/\bbg-(rose|red)-50\b/g, 'bg-danger/10');
  c = c.replace(/\bbg-(rose|red)-100\b/g, 'bg-danger/20');

  // Warning colors (amber & yellow & orange)
  c = c.replace(/\btext-(amber|yellow|orange)-[1-9]00\b/g, 'text-warning');
  c = c.replace(/\bbg-(amber|yellow|orange)-[5-7]00\b/g, 'bg-warning');
  c = c.replace(/\bbg-(amber|yellow|orange)-[4-7]00\/([0-9]+)\b/g, 'bg-warning/$2');
  c = c.replace(/\bhover:bg-(amber|yellow|orange)-[5-7]00\b/g, 'hover:brightness-110');
  c = c.replace(/\bborder-(amber|yellow|orange)-[4-7]00\/([0-9]+)\b/g, 'border-warning/$2');
  c = c.replace(/\bborder-(amber|yellow|orange)-[4-7]00\b/g, 'border-warning');
  c = c.replace(/\bbg-(amber|yellow|orange)-50\b/g, 'bg-warning/10');
  c = c.replace(/\bbg-(amber|yellow|orange)-100\b/g, 'bg-warning/20');

  // Slate
  c = c.replace(/slate-[a-z0-9-]+/g, 'border');

  // Font sizes: minimum 12px (text-xs)
  c = c.replace(/text-\[10px\]/g, 'text-xs');
  c = c.replace(/text-\[11px\]/g, 'text-xs');

  fs.writeFileSync(file, c);
  console.log('Migrated', file);
}
