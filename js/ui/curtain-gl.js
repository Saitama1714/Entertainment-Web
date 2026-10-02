/*
 * WebGL-Zeichnung des Kinovorhangs „Lebendiger Stoff".
 *
 * Der Stoff ist ein feines Gitter (u = quer über den Stoff, 0 = äußerer Rand,
 * 1 = innere Kante; v = von oben nach unten). Der Vertex-Shader legt das
 * Gitter auf den Bildschirm (seitlich gerafft) und berechnet dabei, wie
 * stark der Stoff an jeder Stelle zusammengeschoben ist. Der Fragment-Shader
 * formt daraus die Falten: je enger gerafft, desto steiler die Faltenflanken
 * und desto tiefer die Schatten - wie bei echtem Samt. Dazu kommen Samtglanz
 * an den Flanken, Faltentäler sowie Saum- und Kantenschatten.
 *
 * Während der Bewegung wirft der Vorhang einen weichen Schatten auf den
 * Inhalt (Maske in niedriger Auflösung, weichgezeichnet).
 *
 * Nur WebGL 1, keine Erweiterungen - läuft damit praktisch überall. Schlägt
 * irgendetwas fehl, liefert createCurtainRenderer null und js/ui/curtain.js
 * fällt auf den einfachen CSS-Vorhang zurück.
 */

const GRID_COLS = 200; // quer: genug Punkte für ~20 Falten mit glatten Kanten
const GRID_ROWS = 80;
const MAX_PIXELS = 5.2e6; // Obergrenze der Zeichenfläche (4K/Retina wird leicht herunterskaliert)
const SHADOW_BLUR = 16;     // Weichheit des Schattens auf den Inhalt (CSS-Pixel)
const SHADOW_OFFSET_Y = 8;  // Schatten fällt leicht nach unten

// Gleiche Genauigkeit in allen Shadern (gemeinsame Uniforms müssen übereinstimmen)
const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const VERT_FABRIC = `${PRECISION}
attribute vec2 aUV;
uniform vec2 uView;
uniform float uSide;      // 1 = linke Hälfte, -1 = rechte (gespiegelt)
uniform float uH;
uniform float uLeadTop, uLeadBottom, uGather, uWaveX, uWavePhase;
varying vec2 vUV;
varying vec2 vGradU;
varying vec2 vGradV;
varying vec2 vPos;

float powPos(float x, float e) { return exp2(e * log2(max(x, 1e-5))); }

vec2 mapSide(vec2 uv) {
  float lead = mix(uLeadTop, uLeadBottom, powPos(uv.y, 1.6));
  float x = lead * powPos(uv.x, uGather);
  x += uWaveX * sin(uv.x * 9.0 - uWavePhase * 1.3 + uv.y * 2.4) * uv.x * (1.0 - uv.x) * 4.0 * (0.35 + 0.65 * uv.y);
  return vec2(x, uv.y * uH);
}

vec2 place(vec2 uv) {
  vec2 p = mapSide(uv);
  return vec2(uSide > 0.0 ? p.x : uView.x - p.x, p.y);
}

void main() {
  vec2 uv = aUV;
  vec2 p = place(uv);
  // Jacobi-Matrix per Differenzen -> wie stark ist der Stoff hier gestaucht?
  const float E = 0.002;
  float u0 = max(uv.x - E, 0.0), u1 = min(uv.x + E, 1.0);
  float v0 = max(uv.y - E, 0.0), v1 = min(uv.y + E, 1.0);
  vec2 pu = (place(vec2(u1, uv.y)) - place(vec2(u0, uv.y))) / (u1 - u0);
  vec2 pv = (place(vec2(uv.x, v1)) - place(vec2(uv.x, v0))) / (v1 - v0);
  float det = pu.x * pv.y - pu.y * pv.x;
  if (abs(det) < 1e-3) det = det < 0.0 ? -1e-3 : 1e-3;
  vGradU = vec2(pv.y, -pv.x) / det;   // Gradient von u in Bildschirmpixeln
  vGradV = vec2(-pu.y, pu.x) / det;
  vUV = uv;
  vPos = p;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FRAG_FABRIC = `${PRECISION}
varying vec2 vUV;
varying vec2 vGradU;
varying vec2 vGradV;
varying vec2 vPos;
uniform vec2 uView;
uniform float uSide;
uniform float uFoldN;      // Anzahl Falten über die volle Stoffbreite
uniform float uFoldDepth;  // halbe Faltentiefe in px
uniform float uW;          // halbe Fensterbreite in px (Stoffbreite geschlossen)
uniform float uWave, uWavePhase;

const float TAU = 6.28318531;
const vec3 VELVET = vec3(0.60, 0.012, 0.024);
const vec3 VELVET_DEEP = vec3(0.13, 0.0, 0.006);
const vec3 VELVET_LIGHT = vec3(0.86, 0.16, 0.17);
const vec3 SHEEN = vec3(0.70, 0.19, 0.20);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // Faltenprofil: unregelmäßige Abstände und Tiefen, spitze Täler, runde
  // Kämme. Nach unten hin wandern die Falten leicht und hängen tiefer durch;
  // oben an den Ringen liegen sie enger und regelmäßiger.
  float t = vUV.x * uFoldN;
  float v = vUV.y;
  float drape = smoothstep(0.04, 0.9, v);
  float dDrape = 6.0 * (v - 0.04) * (0.9 - v) / pow(0.86, 3.0) * step(0.04, v) * step(v, 0.9);
  float mA = sin(t * 0.83 + v * 2.3 + 1.1), mB = sin(t * 1.91 - v * 3.7 + 2.4);
  float cA = cos(t * 0.83 + v * 2.3 + 1.1), cB = cos(t * 1.91 - v * 3.7 + 2.4);
  float meander = 0.12 * mA + 0.07 * mB;
  float phase = t + 0.13 * sin(t * 2.37 + 1.7) + 0.06 * sin(t * 4.13 + 0.4) + meander * drape;
  float theta = TAU * phase;
  // Ableitungen der Phase nach u und v (für die Flächenneigung)
  float dPdt = 1.0 + 0.3081 * cos(t * 2.37 + 1.7) + 0.2478 * cos(t * 4.13 + 0.4) + (0.0996 * cA + 0.1337 * cB) * drape;
  float thU = TAU * uFoldN * dPdt;
  float thV = TAU * ((0.276 * cA - 0.259 * cB) * drape + meander * dDrape);

  float amp = 0.72 + 0.28 * sin(t * 1.37 + 0.3) + 0.14 * sin(t * 3.1 + 2.0);
  float ampT = 0.3836 * cos(t * 1.37 + 0.3) + 0.434 * cos(t * 3.1 + 2.0);
  float grav = mix(0.62, 1.1, smoothstep(0.0, 0.55, v));
  float gravV = v < 0.55 ? 0.48 * 6.0 * v * (0.55 - v) / pow(0.55, 3.0) : 0.0;

  float prof = sin(theta) + 0.22 * sin(2.0 * theta + 0.9);
  float dProf = cos(theta) + 0.44 * cos(2.0 * theta + 0.9);
  float h = amp * grav * prof;
  float hU = amp * grav * dProf * thU + grav * prof * ampT * uFoldN;
  float hV = amp * grav * dProf * thV + amp * prof * gravV;

  // Nebenbewegung: eine Welle läuft quer durch die Falten
  float wArg = theta * 0.5 - uWavePhase * 6.0 + v * 2.2;
  h += uWave * 0.9 * sin(wArg);
  hU += uWave * 0.45 * cos(wArg) * thU;
  hV += uWave * 0.9 * cos(wArg) * (0.5 * thV + 2.2);

  vec2 slope = uFoldDepth * (hU * vGradU + hV * vGradV);
  float steep = length(slope);
  if (steep > 4.5) slope *= 4.5 / steep;
  vec3 n = normalize(vec3(-slope, 1.0));

  // Licht von vorn oben, leicht aus der Bühnenmitte
  vec3 L = normalize(vec3(0.30 * uSide, -0.45, 1.0));
  float ndl = dot(n, L);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
  float cavity = smoothstep(-1.2, 0.8, h);
  float squeeze = clamp((length(vGradU) * uW - 1.0) / 4.0, 0.0, 1.0); // 0 = glatt, 1 = eng gerafft

  vec3 col = mix(VELVET_DEEP, VELVET, wrap);
  col = mix(col, VELVET_LIGHT, pow(max(ndl, 0.0), 6.0) * 0.45);
  col += SHEEN * rim * 0.5;
  col *= mix(mix(0.46, 0.3, squeeze), 1.0, cavity);

  // Oben Schatten der Schabracke, unten zum Boden hin dunkler, zu den
  // Seiten hin etwas weniger Bühnenlicht
  col *= mix(0.5, 1.0, smoothstep(18.0, 120.0, vPos.y));
  col *= mix(1.0, 0.7, smoothstep(0.8, 1.0, vPos.y / uView.y));
  col *= mix(0.8, 1.04, 1.0 - abs(vPos.x / uView.x - 0.5) * 2.0);

  // Innere Kante (umgeschlagener Stoff) und Saum: schmal dunkler, feine Lichtkante
  float dInner = (1.0 - vUV.x) / max(length(vGradU), 1e-4);
  float dHem = (1.0 - vUV.y) / max(length(vGradV), 1e-4);
  col *= mix(0.6, 1.0, smoothstep(0.0, 8.0, dInner));
  col += VELVET_LIGHT * 0.14 * (1.0 - smoothstep(0.6, 2.2, dInner));
  col *= mix(0.55, 1.0, smoothstep(0.0, 9.0, dHem));

  // Samtflor: feines Korn und Längsfasern, die mit dem Stoff wandern
  float grain = hash(floor(vec2(vUV.x * uFoldN * 60.0, vUV.y * uView.y * 0.9))) - 0.5;
  col *= 1.0 + grain * 0.05;
  col *= 1.0 + 0.015 * sin(vUV.x * uFoldN * 57.0 + sin(vUV.y * 40.0) * 0.6);
  // Dithering gegen Farbstufen in den dunklen Verläufen
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  // Kantenglättung ohne Mehrfachabtastung: an innerer Kante und Saum über
  // gut einen Pixel weich auslaufen (vormultipliertes Alpha)
  float edgeA = smoothstep(0.0, 1.25, dInner) * smoothstep(0.0, 1.25, dHem);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * edgeA, edgeA);
}`;

const FRAG_MASK = `${PRECISION}
void main() { gl_FragColor = vec4(1.0); }`;

const VERT_SCREEN = `${PRECISION}
attribute vec2 aPos;
uniform vec2 uView;
varying vec2 vPos;
void main() {
  vPos = vec2((aPos.x * 0.5 + 0.5) * uView.x, (0.5 - aPos.y * 0.5) * uView.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_BLUR = `${PRECISION}
uniform sampler2D uTex;
uniform vec2 uSize;   // Texturgröße in Texeln
uniform vec2 uStep;   // Schrittweite in Texeln (Richtung)
void main() {
  vec2 tc = gl_FragCoord.xy / uSize;
  vec2 s = uStep / uSize;
  float a = texture2D(uTex, tc).r * 0.2270270;
  a += (texture2D(uTex, tc + s).r + texture2D(uTex, tc - s).r) * 0.1945946;
  a += (texture2D(uTex, tc + 2.0 * s).r + texture2D(uTex, tc - 2.0 * s).r) * 0.1216216;
  a += (texture2D(uTex, tc + 3.0 * s).r + texture2D(uTex, tc - 3.0 * s).r) * 0.0540541;
  a += (texture2D(uTex, tc + 4.0 * s).r + texture2D(uTex, tc - 4.0 * s).r) * 0.0162162;
  gl_FragColor = vec4(a);
}`;

const FRAG_SHADOW = `${PRECISION}
varying vec2 vPos;
uniform vec2 uView;
uniform sampler2D uMask;
uniform vec2 uShadowOffset;
uniform float uShadow;

void main() {
  vec2 tc = vec2((vPos.x - uShadowOffset.x) / uView.x, 1.0 - (vPos.y - uShadowOffset.y) / uView.y);
  float a = uShadow * texture2D(uMask, tc).r;
  gl_FragColor = vec4(vec3(0.03, 0.01, 0.01) * a, a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader-Fehler");
  }
  return shader;
}

function program(gl, vertSource, fragSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertSource));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSource));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(gl.getProgramInfoLog(prog) || "Link-Fehler");
  }
  // Uniform-Positionen einmal nachschlagen
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    uniforms[info.name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, uniforms, attrib: name => gl.getAttribLocation(prog, name) };
}

/** Render-Ziel in niedriger Auflösung (für Maske und Weichzeichner). */
function target(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, width, height };
}

/**
 * Erstellt den Renderer auf einer <canvas>. Liefert null, wenn WebGL fehlt
 * oder die Shader nicht übersetzt werden können.
 */
export function createCurtainRenderer(canvas) {
  let gl;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true, premultipliedAlpha: true, antialias: false, // Kanten glättet der Shader
      depth: false, stencil: false, preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  if (!gl) return null;

  let fabric, mask, blur, shadow;
  try {
    fabric = program(gl, VERT_FABRIC, FRAG_FABRIC);
    mask = program(gl, VERT_FABRIC, FRAG_MASK);
    blur = program(gl, VERT_SCREEN, FRAG_BLUR);
    shadow = program(gl, VERT_SCREEN, FRAG_SHADOW);
  } catch (error) {
    console.warn("Kinovorhang: WebGL nicht nutzbar, einfacher CSS-Vorhang.", error);
    return null;
  }

  // Stoffgitter (u, v) mit Dreiecken
  const uvs = new Float32Array((GRID_COLS + 1) * (GRID_ROWS + 1) * 2);
  let k = 0;
  for (let r = 0; r <= GRID_ROWS; r++) {
    for (let c = 0; c <= GRID_COLS; c++) { uvs[k++] = c / GRID_COLS; uvs[k++] = r / GRID_ROWS; }
  }
  const indices = new Uint16Array(GRID_COLS * GRID_ROWS * 6);
  k = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const a = r * (GRID_COLS + 1) + c, b = a + 1, d = a + GRID_COLS + 1, e = d + 1;
      indices.set([a, d, b, b, d, e], k);
      k += 6;
    }
  }
  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  let lost = false;
  canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); lost = true; });

  let targets = null; // { mask, ping, pong } passend zur Fenstergröße
  let scale = 1;       // Zeichenpixel je CSS-Pixel

  function ensureSize(viewW, viewH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, viewW * viewH)));
    const w = Math.max(1, Math.round(viewW * scale));
    const h = Math.max(1, Math.round(viewH * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const mw = Math.max(1, Math.round(viewW / 4));
    const mh = Math.max(1, Math.round(viewH / 4));
    if (!targets || targets.mask.width !== mw || targets.mask.height !== mh) {
      if (targets) for (const t of Object.values(targets)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      targets = { mask: target(gl, mw, mh), ping: target(gl, mw, mh), pong: target(gl, mw, mh) };
    }
  }

  function bindFabricGeometry(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    const loc = p.attrib("aUV");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  }

  function setShapeUniforms(p, frame, geom) {
    const u = p.uniforms;
    gl.uniform2f(u.uView, geom.viewW, geom.viewH);
    gl.uniform1f(u.uH, geom.H);
    gl.uniform1f(u.uLeadTop, frame.leadTop);
    gl.uniform1f(u.uLeadBottom, frame.leadBottom);
    gl.uniform1f(u.uGather, frame.gather);
    gl.uniform1f(u.uWaveX, frame.waveX || 0);
    gl.uniform1f(u.uWavePhase, frame.wavePhase || 0);
  }

  function drawHalves(p) {
    for (const side of [1, -1]) {
      gl.uniform1f(p.uniforms.uSide, side);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
  }

  function drawScreen(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    const loc = p.attrib("aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Weicher Schatten: Stoffmaske klein zeichnen und zweimal weichzeichnen. */
  function renderShadowMask(frame, geom) {
    const { mask: m, ping, pong } = targets;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
    gl.viewport(0, 0, m.width, m.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(mask.prog);
    bindFabricGeometry(mask);
    setShapeUniforms(mask, frame, geom);
    drawHalves(mask);

    gl.useProgram(blur.prog);
    gl.uniform2f(blur.uniforms.uSize, m.width, m.height);
    gl.uniform1i(blur.uniforms.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    // Radius in Masken-Texeln (Maske = 1/4 der CSS-Pixel)
    const spread = Math.max(0.5, SHADOW_BLUR / 4 / 4);
    const passes = [[m, ping, [spread, 0]], [ping, pong, [0, spread]], [pong, ping, [spread * 1.8, 0]], [ping, pong, [0, spread * 1.8]]];
    for (const [from, to, step] of passes) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(blur.uniforms.uStep, step[0], step[1]);
      drawScreen(blur);
    }
    return pong.tex;
  }

  /**
   * Zeichnet ein Bild des Vorhangs.
   * @param {object} frame - aus der Timeline (js/logic/curtain-motion.js).
   * @param {{viewW:number, viewH:number, W:number, H:number, R:number}} geom
   */
  function render(frame, geom) {
    if (lost || gl.isContextLost()) return false;
    ensureSize(geom.viewW, geom.viewH);

    const shadowTex = frame.shadow > 0.002 ? renderShadowMask(frame, geom) : null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // vormultipliertes Alpha

    if (shadowTex) {
      gl.useProgram(shadow.prog);
      const u = shadow.uniforms;
      gl.uniform2f(u.uView, geom.viewW, geom.viewH);
      gl.uniform2f(u.uShadowOffset, 0, SHADOW_OFFSET_Y);
      gl.uniform1f(u.uShadow, frame.shadow);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(u.uMask, 0);
      drawScreen(shadow);
    }

    gl.useProgram(fabric.prog);
    bindFabricGeometry(fabric);
    setShapeUniforms(fabric, frame, geom);
    const u = fabric.uniforms;
    const foldN = Math.max(6, Math.round(geom.W / 105));
    gl.uniform1f(u.uFoldN, foldN);
    gl.uniform1f(u.uFoldDepth, 0.2 * (geom.W / foldN));
    gl.uniform1f(u.uW, geom.W);
    gl.uniform1f(u.uWave, frame.wave || 0);
    drawHalves(fabric);
    return true;
  }

  /**
   * Kopiert die beiden Randstreifen (Breite R) des zuletzt gezeichneten Bildes
   * in zwei 2D-Canvas. Muss direkt nach render() im selben Durchlauf
   * aufgerufen werden (danach darf der Browser den Zeichenpuffer leeren).
   */
  function copyStrips(left, right, geom) {
    const sw = Math.round(geom.R * scale);
    const sh = canvas.height;
    for (const [strip, sx] of [[left, 0], [right, canvas.width - sw]]) {
      if (strip.width !== sw || strip.height !== sh) { strip.width = Math.max(1, sw); strip.height = sh; }
      const ctx = strip.getContext("2d");
      ctx.clearRect(0, 0, strip.width, strip.height);
      if (sw > 0) ctx.drawImage(canvas, sx, 0, sw, sh, 0, 0, sw, sh);
    }
  }

  /** Zeichenfläche freigeben, solange nichts animiert wird. */
  function release() {
    canvas.width = 1;
    canvas.height = 1;
  }

  return { render, copyStrips, release, get lost() { return lost || gl.isContextLost(); } };
}
