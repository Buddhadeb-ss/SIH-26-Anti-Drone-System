/**
 * RadarDisplay2D.js
 * Dedicated 2D PPI Planar Radar Scope.
 * Displays RADAR A and RADAR B 180° coverage sectors, range rings (2.5m, 5m, 7.5m, 10m),
 * continuous rotating sweep line, and interactive drone target markers.
 */
export class RadarDisplay2D {
  constructor(canvasId, onSelectTarget) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with id #${canvasId} not found`);
    }

    this.ctx = this.canvas.getContext('2d');
    this.onSelectTarget = onSelectTarget;

    this.size = this.canvas.width || 260;
    this.center = this.size / 2;
    this.radius = this.center - 14;

    this.lastTargets = [];
    this.selectedTargetId = null;

    this.bindEvents();
  }

  bindEvents() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let closest = null;
      let minDistance = 18; // Click hit-radius in pixels

      for (const t of this.lastTargets) {
        if (!t.screenX || !t.screenY) continue;
        if (t.isNeutralized) continue;
        const dist = Math.hypot(clickX - t.screenX, clickY - t.screenY);
        if (dist < minDistance) {
          minDistance = dist;
          closest = t;
        }
      }

      if (closest && this.onSelectTarget) {
        this.selectedTargetId = closest.droneId;
        this.onSelectTarget(closest);
      }
    });
  }

  setSelectedTargetId(id) {
    this.selectedTargetId = id;
  }

  draw(radarData) {
    const { sweepAngle, targets, maxRange } = radarData;
    this.lastTargets = targets;

    const ctx = this.ctx;
    const c = this.center;
    const r = this.radius;

    ctx.clearRect(0, 0, this.size, this.size);

    // 1. Background scope circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1018';
    ctx.fill();
    ctx.clip();

    // 2. RADAR A 180° Sector (+Z Forward: bottom half in screen coords)
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI, false);
    ctx.fillStyle = 'rgba(0, 229, 163, 0.08)';
    ctx.fill();

    // 3. RADAR B 180° Sector (-Z Rearward: top half in screen coords)
    ctx.beginPath();
    ctx.arc(c, c, r, Math.PI, Math.PI * 2, false);
    ctx.fillStyle = 'rgba(255, 153, 0, 0.08)';
    ctx.fill();

    // 4. Concentric Range Rings (5.0m, 10.0m, 15.0m, 20.0m for 20m range)
    const ringDistances = (maxRange >= 15.0) ? [5.0, 10.0, 15.0, 20.0] : [2.5, 5.0, 7.5, 10.0];
    ctx.lineWidth = 1;
    ringDistances.forEach((d) => {
      const ringR = (d / maxRange) * r;
      ctx.beginPath();
      ctx.arc(c, c, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = Math.abs(d - maxRange) < 0.1 ? 'rgba(70, 140, 200, 0.7)' : 'rgba(50, 90, 130, 0.35)';
      ctx.stroke();

      // Range label
      ctx.fillStyle = 'rgba(140, 175, 210, 0.6)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${d}m`, c + 3, c - ringR + 10);
    });

    // 5. Crosshair Axes
    ctx.beginPath();
    ctx.moveTo(c - r, c);
    ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r);
    ctx.lineTo(c, c + r);
    ctx.strokeStyle = 'rgba(60, 100, 140, 0.3)';
    ctx.stroke();

    // Sector Labels
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#00e5a3';
    ctx.fillText('RADAR A (FWD)', c - 34, c + r - 8);

    ctx.fillStyle = '#ff9900';
    ctx.fillText('RADAR B (AFT)', c - 34, c - r + 15);

    // 6. Sweeping Radar Beam with phosphorescent fade
    const sweepSegments = 16;
    for (let i = 0; i < sweepSegments; i++) {
      const alpha = (1 - i / sweepSegments) * 0.25;
      const ang = sweepAngle - (i * 0.035);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, ang - 0.035, ang, false);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
      ctx.fill();
    }

    // Leading sweep line
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(sweepAngle) * r, c + Math.sin(sweepAngle) * r);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 7. Center Station Indicator
    ctx.beginPath();
    ctx.arc(c, c, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffff';
    ctx.fill();

    // 8. Detected Drone Target Blips
    const isDense = targets.length > 8;
    for (const t of targets) {
      const { droneId, position, horizontalDist, bearingDeg, detectionSource, isDetected } = t;

      // Map 3D coordinates to 2D radar screen:
      // In 3D: X is East (+X right), Z is South (+Z down on screen)
      const normDist = horizontalDist / maxRange;
      const screenX = c + (position.x / maxRange) * r;
      const screenY = c + (position.z / maxRange) * r; // +Z is bottom half (RADAR A)

      t.screenX = screenX;
      t.screenY = screenY;

      // Color based on detection source
      let blipColor = '#607080'; // Undetected
      if (detectionSource === 'BOTH') {
        blipColor = '#00f0ff'; // Cyan
      } else if (detectionSource === 'RADAR A') {
        blipColor = '#00e5a3'; // Teal / Green
      } else if (detectionSource === 'RADAR B') {
        blipColor = '#ff9900'; // Amber
      }

      const isSelected = droneId === this.selectedTargetId;

      // Selected target highlight ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Corner cross reticle
        ctx.beginPath();
        ctx.moveTo(screenX - 12, screenY);
        ctx.lineTo(screenX + 12, screenY);
        ctx.moveTo(screenX, screenY - 12);
        ctx.lineTo(screenX, screenY + 12);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Neutralized target indicator
      if (t.isNeutralized) {
        blipColor = '#ff3344';
        ctx.strokeStyle = '#ff3344';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX - 4, screenY - 4);
        ctx.lineTo(screenX + 4, screenY + 4);
        ctx.moveTo(screenX + 4, screenY - 4);
        ctx.lineTo(screenX - 4, screenY + 4);
        ctx.stroke();
      } else {
        // Blip core
        ctx.beginPath();
        ctx.arc(screenX, screenY, isSelected ? 5 : (isDense ? 3.5 : 4), 0, Math.PI * 2);
        ctx.fillStyle = blipColor;
        ctx.fill();
      }

      // Blip label (ID + Distance / KILLED)
      ctx.font = isSelected ? 'bold 10px "JetBrains Mono", monospace' : (isDense ? '8px "JetBrains Mono", monospace' : '9px "JetBrains Mono", monospace');
      ctx.fillStyle = isSelected ? '#ffffff' : blipColor;
      const labelText = t.isNeutralized ? `${droneId} ✗` : (isDense ? droneId : `${droneId} (${horizontalDist.toFixed(1)}m)`);
      ctx.fillText(labelText, screenX + 5, screenY - 2);

      // Detection source tag
      if (isDetected && !t.isNeutralized && !isDense) {
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
        ctx.fillText(detectionSource, screenX + 7, screenY + 7);
      }
    }

    ctx.restore();

    // Outer border ring
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(70, 120, 180, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
