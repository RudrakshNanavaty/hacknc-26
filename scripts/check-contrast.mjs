// Conservative contrast check for the two text/surface pairs used by the shell.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import console from "node:console";
import process from "node:process";
const css = readFileSync(new URL("../src/ui/tokens.css",import.meta.url),"utf8");
const token = name => css.match(new RegExp(`${name}: #([a-f0-9]{6})`))[1];
const rgb = h => h.match(/../g).map(x => parseInt(x,16)/255);
const luminance = a => a.map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((s,x,i) => s+x*[.2126,.7152,.0722][i],0);
const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const background = rgb(token("--c-water-deep")).map(x=>.66+.34*x);
const pairs = [["Primary text on darkest glass",rgb(token("--c-ink-700")),background],["Secondary research text on white",rgb(token("--c-ink-500")),[1,1,1]]];
for (const [label,text,surface] of pairs) {
  const contrast = ratio(text,surface);
  console.log(`${label}: ${contrast.toFixed(2)}:1`);
  if(contrast < 4.5) process.exitCode = 1;
}
