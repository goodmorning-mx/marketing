(() => {
  const canvas = document.querySelector('.dashboard-orb-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true
  });
  if (!gl) return;

  const vertexSource = `#version 300 es
    in vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;
    out vec4 outColor;

    void main() {
      vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y) * 2.0;
      float radius = length(uv);
      float angle = atan(uv.y, uv.x);
      float wave = sin(angle * 3.0 + uTime * 0.7) * 0.018
                 + sin(angle * 7.0 - uTime * 0.42) * 0.009
                 + sin(uv.x * 8.0 + uv.y * 5.0 + uTime * 0.55) * 0.012;
      float ringRadius = 0.69 + wave;
      float ring = exp(-pow((radius - ringRadius) / 0.052, 2.0));
      float innerGlow = exp(-radius * 3.1) * 0.54;
      float outerGlow = exp(-max(radius - ringRadius, 0.0) * 8.5) * (1.0 - smoothstep(ringRadius, ringRadius + 0.19, radius)) * 0.3;

      float orbitAngle = -uTime * 0.72;
      float angleDelta = atan(sin(angle - orbitAngle), cos(angle - orbitAngle));
      float orbitHead = exp(-pow(angleDelta / 0.13, 2.0)) * exp(-pow((radius - ringRadius) / 0.12, 2.0));
      float orbitTrail = exp(-max(-angleDelta, 0.0) * 4.8) * smoothstep(0.0, 0.22, -angleDelta)
                       * exp(-pow((radius - ringRadius) / 0.09, 2.0)) * 0.7;

      vec3 deepBlue = vec3(0.008, 0.018, 0.20);
      vec3 blue = vec3(0.035, 0.12, 0.82);
      vec3 ice = vec3(0.42, 0.64, 1.0);
      vec3 hue = mix(blue, ice, 0.5 + 0.5 * sin(angle * 2.0 - uTime * 0.3));
      float alpha = clamp(innerGlow + ring * 0.77 + outerGlow + orbitTrail * 0.46 + orbitHead * 0.9, 0.0, 0.94);
      vec3 color = deepBlue * innerGlow + hue * (ring * 0.8 + outerGlow + orbitTrail * 0.56) + ice * orbitHead;
      color += blue * exp(-pow((radius - 0.48) / 0.27, 2.0)) * 0.22;
      outColor = vec4(color * alpha, alpha);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) return;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return;
  }

  const resolution = gl.getUniformLocation(program, 'uResolution');
  const time = gl.getUniformLocation(program, 'uTime');
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(program);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let startTime = 0;
  let visible = true;

  const draw = now => {
    frame = 0;
    if (!visible || document.hidden) return;
    if (!startTime) startTime = now;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, reduceMotion.matches ? 0 : (now - startTime) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible && !frame) frame = requestAnimationFrame(draw);
    else if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  const resizeObserver = new ResizeObserver(resize);
  observer.observe(canvas);
  resizeObserver.observe(canvas);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      draw(performance.now());
    } else if (!reduceMotion.matches && visible && !frame) {
      frame = requestAnimationFrame(draw);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!document.hidden && visible && !frame) {
      frame = requestAnimationFrame(draw);
    }
  });
  resize();
})();
