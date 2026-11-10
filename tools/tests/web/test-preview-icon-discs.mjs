// Web Admin previews show the icon discs like the device: taller tiles get a
// disc of round_diameter() centered on the unchanged icon, tinted with the
// icon color; every circle shows (user 2026-10-11: no circle options, stored
// per-tile values of older tiles are not drawn). Scene
// tiles resolve their icon through the scene alias -> entity map, as the
// device does; before, the preview had no such map and showed no scene icon.
import assert from 'node:assert/strict';
import {readAdminDeliverySource, readRepoFile, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');
// Source contract: device constants reach the preview; the server supplies the map.
assert.ok(read('src/web/server/render/web_admin_styles.cpp').includes('emit_exact("icon-disc-round", tile_icon_disc::round_diameter());'));
const tiles = read('src/web/server/handlers/web_admin_tiles.cpp');
assert.match(tiles, /json \+= ",\\"scene_entities\\":\{";\s*bool first_scene = true;\s*for \(const auto& scene : parseSceneList\(ha\.scene_alias_text\)\)/);
const html = read('src/web/server/render/web_admin_html.cpp');
assert.match(html, /if \(tile\.type == TILE_SCENE && !iconName\.length\(\) &&[\s\S]*?haBridgeConfig\.findEntityIcon\(scene_entity\)/,
  'Server-rendered scene tiles use the scene entity icon');
assert.match(html, /tile_icon_disc::icon_color_tints\(binary_sensor_visual_color\(binary_sensor_state\)\)/);

const page = `<!doctype html><html lang="en"><head><style>${readRepoFile('src/web/assets/admin.css')}
:root{--icon-size:24px;--icon-disc-round:30px;--icon-disc-corner:34px;--compact-inset:2px;--tile-radius:11px;--preview-cell-w:84px;--preview-cell-h:72px;--preview-gap:5px;--tile-card:var(--tile-default-bg, #2A2A2A);}
</style></head><body>
<div id="tab-tiles-test" class="tile-tab"><div class="tile-grid">
<div class="tile" id="test-tile-0" data-index="0" style="width:84px;height:72px"></div>
<div class="tile" id="test-tile-1" data-index="1" style="width:84px;height:72px"></div>
<div class="tile" id="test-tile-2" data-index="2" style="width:84px;height:72px"></div></div></div>
<div id="testSettings" class="tile-settings"><select id="test_tile_type"><option value="1">Sensor</option><option value="2">Scene</option></select>
<textarea id="test_tile_title"></textarea><input id="test_tile_icon"><input type="color" id="test_tile_color">
${['col','row','span_w','span_h'].map(n=>`<input id="test_tile_${n}" value="1">`).join('')}
<select id="test_scene_alias"><option value="tv">TV</option></select>
<div class="icon-color-segmented choice-row tile-color-modes" id="test_tile_color_modes"><button type="button" data-tile-color-mode="global" onclick="setTileColorMode('test','global')">Global</button><button type="button" id="test_tile_color_mode_custom" data-tile-color-mode="custom" onclick="setTileColorMode('test','custom')">Custom</button></div>
<div id="test_tile_color_row" class="tile-color-row"></div>
<div id="test_tile_icon_fill_row" class="tile-icon-color-fields icon-color-fill hidden" data-tab="test"><label class="inline-checkbox"><input type="checkbox" id="test_tile_icon_fill" data-icon-color="fill-target"> Fill</label></div></div>
<div class="tile" id="test-tile-3" data-index="3" style="width:84px;height:34px"></div>
<pre id="result"></pre><script>
const nativeListen=document.addEventListener.bind(document);document.addEventListener=(name,...args)=>{if(name!=='DOMContentLoaded')nativeListen(name,...args);};
const APP_I18N={},CLIMATE_I18N={},BINARY_SENSOR_I18N={},GRID_COLS=7,GRID_ROWS=5,TILES_PER_GRID=35,ADMIN_WEB_SESSION_TOKEN='test';
const TILE_TYPE_REGISTRY={0:{},1:{css:'sensor',fields:'sensor',preview:'sensor',sharedBg:true,defaultBg:'#222222'},2:{css:'scene',fields:'scene',preview:'none',sharedBg:true,defaultBg:'#222222'},10:{css:'text',fields:'text',preview:'none',sharedBg:true,defaultBg:'#222222'}};
const TILE_TABS=[],TAB_BY_FOLDER={},FOLDER_BY_TAB={},SCREENSAVER_FOLDER_ID=65535,SCREENSAVER_TILE_DEFAULT_OPACITY=0,SCREENSAVER_TILE_DEFAULT_COLOR='#000000',MEDIA_TILE_TYPE=15,MEDIA_TILE_MIN_SPAN=2,MEDIA_TILE_MAX_SPAN=3;
window.fetch=async()=>({json:async()=>({success:true})});
${inlineScriptSafe(readAdminDeliverySource())}
try{
 const check=(v,m)=>{if(!v)throw Error(m);};
 const meta=normalizeSensorMetaPayload({values:{},icons:{'scene.tv':'mdi:television','sensor.t':'mdi:thermometer'},scene_entities:{tv:'scene.tv'}});
 sensorMetaCache=meta;
 const disc=el=>getComputedStyle(el.querySelector('.tile-icon'),'::after');
 // Cached grid: a scene tile without an icon shows its scene entity's icon.
 renderTileFromData('test',0,{type:2,title:'TV',scene_alias:'tv',icon_name:''},meta);
 const scene=document.getElementById('test-tile-0');
 check(scene.querySelector('.tile-icon.mdi-television'),'Scene tile resolves the scene entity icon');
 check(disc(scene).display!=='none'&&disc(scene).width==='34px'&&disc(scene).height==='34px','A centered icon uses the header corner disc (header_diameter)');
 // A grid refresh normalizes the cached metadata a second time; the scene
 // map must survive it (it lost every scene icon in the preview).
 const twice=normalizeSensorMetaPayload(meta);
 check(twice.sceneEntities.tv==='scene.tv','The scene map survives a second normalization');
 renderTileFromData('test',0,{type:2,title:'TV',scene_alias:'tv',icon_name:''},twice);
 check(scene.querySelector('.tile-icon.mdi-television'),'Scene icons stay after a grid refresh');
 renderTileFromData('test',3,{type:2,title:'TV',scene_alias:'tv',icon_name:'',span_w:1,span_h:0.5},twice);
 check(document.querySelector('#test-tile-3 .tile-icon.mdi-television'),'Half-height scene tiles show the entity icon too');
 const icon=scene.querySelector('.tile-icon').getBoundingClientRect();
 check(Math.abs(icon.width/2-parseFloat(disc(scene).left))<0.6,'Disc is centered on the icon');
 // A neutral circle (tone_color::fill): an opaque grey a fixed step above the
 // tile, like the device.
 const channels=c=>c.slice(c.indexOf('(')+1,c.indexOf(')')).split(',').map(Number);
 const white=c=>{const v=channels(c);return (v.length===3||Math.abs(v[3]-1)<0.01)&&v[0]===v[1]&&v[1]===v[2];};
 check(white(disc(scene).backgroundColor),'White icon keeps an opaque neutral disc: '+disc(scene).backgroundColor);
 const lighter=(el,c)=>channels(c)[0]>channels(getComputedStyle(el).backgroundColor)[0];
 check(lighter(scene,disc(scene).backgroundColor),'The neutral disc is lighter than its tile');
 // A colored icon tints its disc.
 renderTileFromData('test',1,{type:1,title:'T',sensor_entity:'sensor.t',icon_name:'thermometer'},meta);
 const sensor=document.getElementById('test-tile-1');
 sensor.querySelector('.tile-icon').style.color='rgb(255, 213, 79)';applyIconDiscTint(sensor);
 check(sensor.querySelector('.tile-icon').classList.contains('tile-icon-tinted'),'Colored icon is tinted');
 check(!white(disc(sensor).backgroundColor),'Tinted disc uses the icon hue');
 // Stored per-tile "circle off" and "glow off" of older tiles are not drawn.
 renderTileFromData('test',1,{type:1,title:'T',sensor_entity:'sensor.t',icon_name:'thermometer',icon_glow:0,icon_disc:2},meta);
 sensor.querySelector('.tile-icon').style.color='rgb(255, 213, 79)';applyIconDiscTint(sensor);
 check(disc(sensor).display!=='none'&&sensor.querySelector('.tile-icon').classList.contains('tile-icon-tinted'),
  'Old per-tile circle options draw the circle in the icon color');
 // A tile with an icon is drawn on the theme card, a stored own color of an
 // older tile included; the half-height disc follows the card.
 renderTileFromData('test',3,{type:1,title:'Half',sensor_entity:'sensor.t',icon_name:'thermometer',span_w:1,span_h:0.5,bg_color:0x01FF0000},meta);
 renderTileFromData('test',0,{type:2,title:'TV',scene_alias:'tv',icon_name:'',bg_color:0x01FF0000},meta);
 const half=document.getElementById('test-tile-3');
 check(half.classList.contains('sensor-compact'),'Half-height tile uses the compact disc');
 for(const el of [scene,half]) check(getComputedStyle(el).backgroundColor==='rgb(42, 42, 42)','An icon tile is drawn on the theme card: '+getComputedStyle(el).backgroundColor);
 check(white(disc(scene).backgroundColor)&&lighter(scene,disc(scene).backgroundColor),'Taller disc a step above the card: '+disc(scene).backgroundColor);
 const halfDisc=getComputedStyle(half.querySelector('.tile-icon')).backgroundColor;
 check(white(halfDisc)&&lighter(half,halfDisc),'Half-height disc a step above the card: '+halfDisc);
 // Per-tile icon colors (icon-colors.js): first matching rule, else the fixed
 // color; unknown states keep the type color. Glow follows the result.
 const colored=(value,record)=>{meta.values['sensor.t']=value;renderTileFromData('test',1,{type:1,title:'T',sensor_entity:'sensor.t',icon_name:'thermometer',icon_colors:record},meta);return getComputedStyle(sensor.querySelector('.tile-icon')).color;};
 const rule=['v2','FF0000','is 00FF00 25'].join(String.fromCharCode(10));
 check(colored('25',rule)==='rgb(0, 255, 0)','Matching rule colors the icon');
 check(sensor.querySelector('.tile-icon').classList.contains('tile-icon-tinted'),'Rule color tints the disc');
 check(colored('10',rule)==='rgb(255, 0, 0)','Fixed icon color without a matching rule');
 check(colored('unavailable',rule)==='rgb(255, 255, 255)','Unknown states keep the type color');
 // Tile color: a tile with an icon offers only "Fill"; a tile without an
 // icon (Text) keeps Global or Custom. A stored default grey loads as
 // Global, picking a color selects Custom, Global returns to the theme card
 // and a return to Custom restores the picked color.
 currentTileTab='test';currentTileIndex=1;folderByTab.test=1;
 const colorInput=document.getElementById('test_tile_color'),fill=document.getElementById('test_tile_icon_fill');
 const active=()=>[...document.querySelectorAll('#test_tile_color_modes button.active')].map(b=>b.dataset.tileColorMode).join();
 const hidden=id=>document.getElementById(id).classList.contains('hidden')||document.getElementById(id).classList.contains('color-hidden');
 document.getElementById('test_tile_type').innerHTML+='<option value="10">Text</option>';
 document.getElementById('test_tile_type').value='1';
 syncTileColorMode('test');
 check(hidden('test_tile_color_modes')&&hidden('test_tile_color_row')&&!hidden('test_tile_icon_fill_row'),'A tile with an icon offers only Fill');
 // Really not shown (b378: the grid rule of the choice row beat
 // .tile-settings .hidden, so Global/Custom stayed visible) and Custom does
 // nothing there (its hidden picker opened in the top left corner).
 const shown=id=>getComputedStyle(document.getElementById(id)).display!=='none';
 check(!shown('test_tile_color_modes')&&!shown('test_tile_color_row')&&shown('test_tile_icon_fill_row'),'Icon tile: Global/Custom and the color field are not shown');
 let picked=0;colorInput.showPicker=()=>{picked++;};
 setTileColorMode('test','custom');
 check(picked===0&&tileColorInputIsDefault('test'),'Custom does nothing on a tile with an icon');
 document.getElementById('test_tile_type').value='10';
 setTileColorInputFromStored('test',0x012A2A2A,'#101010');
 check(active()==='global'&&colorInput.value==='#101010'&&hidden('test_tile_color_row')&&!hidden('test_tile_color_modes')&&
  hidden('test_tile_icon_fill_row')&&!fill.checked,'Text: a stored default grey loads as Global without a color field');
 check(shown('test_tile_color_modes')&&!shown('test_tile_icon_fill_row'),'Text: Global/Custom shown, no Fill');
 colorInput.value='#ff0000';markTileColorInputExplicit('test');
 check(active()==='custom'&&!tileColorInputIsDefault('test')&&!hidden('test_tile_color_row'),'Picking a color selects Custom');
 setTileColorMode('test','global');
 check(active()==='global'&&tileColorInputIsDefault('test')&&!fill.checked,'Global returns to the theme card');
 setTileColorMode('test','custom');
 check(active()==='custom'&&colorInput.value==='#ff0000','Custom restores the picked color');
 // Live preview: the scene alias field resolves the same icon.
 currentTileTab='test';currentTileIndex=2;folderByTab.test=1;
 document.getElementById('test_tile_type').value='2';document.getElementById('test_scene_alias').value='tv';
 updateTilePreview('test');
 check(document.querySelector('#test-tile-2 .tile-icon.mdi-television'),'Live scene preview resolves the scene entity icon');
 document.body.dataset.result='pass';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}
</script></body></html>`;
try {runDomHarness({label:'Preview icon discs and scene icons',html:page,tmpPrefix:'hometiles-preview-discs-'});}
catch(error){throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]||error.message.slice(0,400));}
console.log('Preview icon discs (always shown, icon color), tile color choice and scene icons pass');
