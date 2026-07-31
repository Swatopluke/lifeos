import { $, CSS } from './utils.js';

let charts={};
export function drawChart(id, cfg){
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), cfg);
}
Chart.defaults.color = CSS('--faint');
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.font.size = 10;

export const gridOpt = { grid:{color:CSS('--border'),drawTicks:false}, border:{display:false} };
export const baseOpts = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{display:false}, tooltip:{ backgroundColor:CSS('--surface2'),
    borderColor:CSS('--border'), borderWidth:1, titleColor:CSS('--text'),
    bodyColor:CSS('--dim'), padding:9, displayColors:false } },
  scales:{ x:{...gridOpt, grid:{display:false}}, y:{...gridOpt} }
};
