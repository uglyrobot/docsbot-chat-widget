// Shared with dashboard/log rendering. Widget color is the sole brand setting;
// secondary states are derived tints, while prose stays neutral for readability.
function rgb(value) {
  if (typeof value !== 'string') return null;
  const hex=value.trim().match(/^#([a-f\d]{3}|[a-f\d]{6})$/i);
  if(hex){const s=hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1];return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));}
  const match=value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return match?match.slice(1).map(n=>Math.max(0,Math.min(255,+n))):null;
}
function color(channels){return `rgb(${channels.map(Math.round).join(',')})`;}
function blend(a,b,weight){return color(rgb(a).map((n,i)=>n*weight+rgb(b)[i]*(1-weight)));}
function luminance(value){const c=rgb(value).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function safeAccent(value,surfaces,minimum){
 const minimumRatio=v=>Math.min(...surfaces.map(bg=>contrast(v,bg)));
 if(minimumRatio(value)>=minimum)return value;
 const target=minimumRatio('#000000')>minimumRatio('#ffffff')?'#000000':'#ffffff';
 for(let n=1;n<=100;n++){const candidate=blend(value,target,1-n/100);if(minimumRatio(candidate)>=minimum)return candidate;}
 return target;
}
export function createOpenUITheme(brandColor,mode='light'){
 const dark=mode==='dark';const brand=rgb(brandColor)?color(rgb(brandColor)):'rgb(18,146,238)';
 const surface=dark?'#111827':'#ffffff',card=dark?'#1f2937':'#ffffff';
 const channels=rgb(brand);
 const achromatic=Math.max(...channels)-Math.min(...channels)<12;
 const actionBrand=achromatic && !dark && luminance(brand)>.85?'#314351':achromatic && dark && luminance(brand)<.05?'#f8fafc':brand;
 const primary=safeAccent(color(rgb(actionBrand)),[surface,card],3);
 const foreground=contrast(primary,'#ffffff')>=contrast(primary,'#000000')?'#ffffff':'#000000';
 const hover=blend(primary,foreground==='#ffffff'?'#000000':'#ffffff',.9);
 const secondary=blend(brand,card,dark?.18:.08);
 const text=safeAccent(brand,[surface,card,secondary,blend(brand,card,.16),dark?'#182231':'#f8fafc'],4.5);
 const muted=dark?'#aebccd':'#526579';
 const font='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';
 // Upstream distributes from the middle of the palette for one series.
 const palette=['#7c3aed','#d97706',primary,'#db2777','#64748b'].map(c=>safeAccent(c,[surface,card],3));
 return {
  background:surface,foreground:card,popoverBackground:card,
  textNeutralPrimary:dark?'#f8fafc':'#314351',textNeutralSecondary:muted,
  textNeutralLink:text,textBrand:text,textAccentPrimary:foreground,textAccentSecondary:foreground,
  interactiveAccentDefault:primary,interactiveAccentHover:hover,interactiveAccentPressed:hover,
  interactiveAccentDisabled:blend(primary,card,.35),borderAccent:blend(brand,card,.2),borderAccentEmphasis:primary,
  borderDefault:dark?'#374151':'#dce3e9',borderInteractive:dark?'#66768a':'#7b8998',borderInteractiveSelected:primary,
  highlight:secondary,highlightSubtle:blend(brand,card,dark?.08:.04),highlightStrong:blend(brand,card,.16),
  sunk:dark?'#182231':'#f8fafc',sunkLight:dark?'#182231':'#f8fafc',
  fontBody:font,fontHeading:font,fontLabel:font,fontNumbers:font,
  textBodyDefault:`400 14px/1.55 ${font}`,textBodyDefaultHeavy:`600 14px/1.55 ${font}`,
  textBodySm:`400 13px/1.5 ${font}`,textBodySmHeavy:`600 13px/1.5 ${font}`,
  textBodyLg:`400 16px/1.5 ${font}`,textBodyLgHeavy:`600 16px/1.5 ${font}`,
  textLabelDefault:`500 13px/1.4 ${font}`,textLabelDefaultHeavy:`600 13px/1.4 ${font}`,
  textLabelSm:`500 13px/1.4 ${font}`,textLabelSmHeavy:`600 13px/1.4 ${font}`,
  textHeadingXs:`600 15px/1.35 ${font}`,textHeadingSm:`600 16px/1.35 ${font}`,
  textNumbersDefault:`400 14px/1.5 ${font}`,textNumbersDefaultHeavy:`600 14px/1.5 ${font}`,
  textNumbersLg:`400 16px/1.4 ${font}`,textNumbersLgHeavy:`600 16px/1.4 ${font}`,
  borderInteractiveEmphasis:primary,
  textHeadingMd:`600 18px/1.3 ${font}`,textHeadingLg:`600 20px/1.3 ${font}`,textHeadingXl:`700 22px/1.3 ${font}`,
  textBodyXs:`400 12px/1.5 ${font}`,textBodyXsHeavy:`600 12px/1.5 ${font}`,
  textLabelXs:`500 12px/1.4 ${font}`,textLabelXsHeavy:`600 12px/1.4 ${font}`,
  textLabelLg:`500 14px/1.4 ${font}`,textLabelLgHeavy:`600 14px/1.4 ${font}`,
  textNumbersXs:`400 12px/1.5 ${font}`,textNumbersXsHeavy:`600 12px/1.5 ${font}`,
  textNumbersSm:`400 13px/1.5 ${font}`,textNumbersSmHeavy:`600 13px/1.5 ${font}`,
  textNumbersHeadingSm:`600 16px/1.3 ${font}`,textNumbersHeadingMd:`600 18px/1.3 ${font}`,
  textNumbersHeadingLg:`600 20px/1.3 ${font}`,textNumbersHeadingXl:`600 22px/1.3 ${font}`,
  radiusM:'8px',radiusL:'10px',radiusXl:'12px',defaultChartPalette:palette,
  barChartPalette:palette,lineChartPalette:palette,areaChartPalette:palette,pieChartPalette:palette,
  radarChartPalette:palette,radialChartPalette:palette,horizontalBarChartPalette:palette,
 };
}
