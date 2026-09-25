import * as THREE from 'three';

/**
 * Engine.js
 * High-performance WebGL Engine configured for a Pure White High-Altitude Ladakh Environment.
 * Clean, high-key white daylight with sharp directional shadows so the prototype,
 * drones, and trajectory paths stand out with maximum visibility and contrast.
 */
export class Engine {
  constructor(containerId = 'canvas-container') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container with id #${containerId} not found`);
    }

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // 1. Scene setup: High-Altitude Ladakh Alpine Sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcd3ea); // Crisp atmospheric horizon color
    // Atmospheric depth fog: Leaves the 10m tactical radar zone 100% crisp & clear,
    // while softly blending distant Himalayan mountain massifs into atmospheric aerial perspective
    this.scene.fog = new THREE.Fog(0xc5daf0, 65, 320);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      0.05,
      800
    );

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    // 4. Build High-Altitude Alpine Sky Dome & Sun Halo
    this.buildHighAltitudeSkyDome();

    // 5. Clean Radiant High-Altitude Daylight Lighting
    this.setupLighting();

    // 5. Animation Callbacks & Clock
    this.clock = new THREE.Clock();
    this.updateCallbacks = [];

    // 6. Handle Window Resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  buildHighAltitudeSkyDome() {
    // High-Altitude Ladakh Atmospheric Sky Hemisphere
    const skyGeo = new THREE.SphereGeometry(450, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      varying vec3 vWorldPosition;
      void main() {
        float h = clamp(normalize(vWorldPosition).y, 0.0, 1.0);
        // Ladakh high-altitude atmosphere gradient:
        // Deep sapphire azure at zenith (#0c2340) -> vibrant alpine blue (#1d4e89) -> pale icy horizon (#c5daf0)
        vec3 colZenith = vec3(0.047, 0.137, 0.251);
        vec3 colMid = vec3(0.114, 0.306, 0.537);
        vec3 colHorizon = vec3(0.773, 0.855, 0.941);

        vec3 skyColor = mix(colHorizon, colMid, smoothstep(0.0, 0.35, h));
        skyColor = mix(skyColor, colZenith, smoothstep(0.35, 0.95, h));
        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Radiant high-altitude Sun disc with atmospheric corona glare
    const sunGroup = new THREE.Group();
    sunGroup.position.set(65, 110, 75);

    const sunCoreGeo = new THREE.SphereGeometry(6, 16, 16);
    const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
    sunGroup.add(sunCore);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.2, 'rgba(255, 245, 215, 0.7)');
    grad.addColorStop(0.5, 'rgba(180, 220, 255, 0.25)');
    grad.addColorStop(1.0, 'rgba(180, 220, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const sunTex = new THREE.CanvasTexture(canvas);
    const sunSpriteMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, blending: THREE.AdditiveBlending });
    const sunSprite = new THREE.Sprite(sunSpriteMat);
    sunSprite.scale.set(40, 40, 1);
    sunGroup.add(sunSprite);

    this.scene.add(sunGroup);
  }

  setupLighting() {
    // Ambient Light: Soft high-altitude alpine fill
    const ambientLight = new THREE.AmbientLight(0xd4e5f7, 0.85);
    this.scene.add(ambientLight);

    // Hemisphere Light: Crisp azure sky vs brilliant snow bounce
    const hemiLight = new THREE.HemisphereLight(0x4a7eb5, 0xffffff, 0.85);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    // Direct High-Altitude Sunlight (Warm crisp daylight with sharp defined shadows)
    this.sunLight = new THREE.DirectionalLight(0xfff8ed, 1.55);
    this.sunLight.position.set(16, 28, 18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.2;
    this.sunLight.shadow.camera.far = 70;
    const shadowDist = 16;
    this.sunLight.shadow.camera.left = -shadowDist;
    this.sunLight.shadow.camera.right = shadowDist;
    this.sunLight.shadow.camera.top = shadowDist;
    this.sunLight.shadow.camera.bottom = -shadowDist;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);

    // Soft cross-fill to illuminate all mechanical details of the prototype
    const fillLight = new THREE.DirectionalLight(0xb5d6f5, 0.55);
    fillLight.position.set(-16, 16, -12);
    this.scene.add(fillLight);
  }

  onWindowResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
  }

  addUpdateCallback(fn) {
    this.updateCallbacks.push(fn);
  }

  start() {
    this.clock.start();
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(this.clock.getDelta(), 0.1);
      const elapsedTime = this.clock.getElapsedTime();

      for (let i = 0; i < this.updateCallbacks.length; i++) {
        this.updateCallbacks[i](delta, elapsedTime);
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }
}
