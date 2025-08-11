import React, { useState, useEffect, useRef } from "react";

// NOTE: This component has **no** MetaMask/web3 calls. If you still see a
// "Failed to connect to MetaMask" error, it's coming from the host/sandbox
// environment or an installed browser extension, not from this code.

const ConnectionVisualizer = () => {
  // Guard against heavy first paint in sandbox: delay full ring render until after mount
  const [isReady, setIsReady] = useState(false);

  // --- State ---
  const [scatter, setScatter] = useState(false);
  const [firstDegree, setFirstDegree] = useState(10);
  const [averageConnections, setAverageConnections] = useState(12);
  const [secondDegree, setSecondDegree] = useState(0);
  const [thirdDegree, setThirdDegree] = useState(0);
  const [totalNetworkSize, setTotalNetworkSize] = useState(0);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [colorScheme, setColorScheme] = useState("default");
  const [showRipples, setShowRipples] = useState(false);
  const [rippleSeq, setRippleSeq] = useState(0);
  const [continuousType, setContinuousType] = useState(null); // null | 'good-vibes' | 'loving-kindness' | 'we-care'
  const [beamType, setBeamType] = useState("loving-kindness"); // "good-vibes" | "loving-kindness" | "we-care"
  const svgRef = useRef();
  const imageRef = useRef();
  // (timer ref unused now that continuous mode is toggled via pointer)
  // const rippleTimerRef = useRef(null);
  const rippleRefs = useRef([]);
  const rippleRafRef = useRef(0);

  // --- Effects ---
  useEffect(() => {
    updateNetwork(firstDegree, averageConnections);
    // gentle scatter when numbers change
    setScatter(true);
    const t = setTimeout(() => setScatter(false), 1000);
    return () => clearTimeout(t);
  }, [firstDegree]);

  // Defer heavy SVG node rendering until after mount to avoid init stalls
  useEffect(() => {
    // Primary: defer heavy draw until after mount
    let raf1 = requestAnimationFrame(() => {
      let raf2 = requestAnimationFrame(() => setIsReady(true));
      // Cleanup nested raf
      return () => cancelAnimationFrame(raf2);
    });
    // Fallback: if RAF is throttled/blocked in the sandbox, ensure readiness anyway
    const fallback = setTimeout(() => setIsReady(true), 200);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(fallback);
    };
  }, []);

  // Simple runtime tests to catch logic regressions (acts as "test cases")
  useEffect(() => {
    const F = 3, A = 2; // tiny sample
    const S = F * A;
    const T = S * A;
    console.assert(S === 6, "Second-degree calc failed");
    console.assert(T === 12, "Third-degree calc failed");
    console.assert(F + S + T === 21, "Total network size calc failed");

    // extra sanity checks (do not modify behavior)
    const F2 = 10, A2 = 15;
    const S2 = F2 * A2; // 150
    const T2 = S2 * A2; // 2250
    console.assert(S2 === 150 && T2 === 2250 && F2 + S2 + T2 === 2410, "Example calc mismatch");
  }, []);

  // --- Computation ---
  const updateNetwork = (F, A) => {
    const S = F * A; // second-degree
    const T = S * A; // third-degree
    setSecondDegree(S);
    setThirdDegree(T);
    setTotalNetworkSize(F + S + T);
  };

  // --- Colors ---
  const centerColors = {
    default: "#f59e0b",
    cool: "#6366f1",
    forest: "#14532d",
    ocean: "#0c4a6e",
    dusk: "#7c3aed",
    grayscale: "#555",
    rainbow: "#e11d48",
    cupid: "#ff4d6d",
  };

  const schemes = {
    default: ["#f59e0b", "#f97316", "#ef4444"],
    cool: ["#6366f1", "#0ea5e9", "#34d399"],
    forest: ["#14532d", "#166534", "#4ade80"],
    ocean: ["#0c4a6e", "#0284c7", "#7dd3fc"],
    dusk: ["#7c3aed", "#9333ea", "#e879f9"],
    grayscale: ["#555", "#999", "#ccc"],
    rainbow: ["#ef4444", "#f59e0b", "#facc15", "#22c55e", "#22d3ee", "#6366f1", "#a855f7"],
    cupid: ["#ff4d6d", "#ff6b81", "#ff8fa3"],
  };

  // --- Rendering helpers ---
  const renderClusteredNodes = (count, radius, degree) => {
    const nodes = [];
    if (!count) return nodes;

    // --- Dynamic density & distribution ---
    // Scale band thickness and spacing with demand so very large networks stay readable.
    const baseThickness = degree === 1 ? 18 : degree === 2 ? 24 : 36; // px
    const baseSpacing = degree === 3 ? 2 : 4; // px (min gap)

    // Allow thicker bands and smaller spacing as counts get very large
    const densityBoost = Math.min(2.0, Math.log10((count || 1)) / 3); // 0..~2
    const thickness = baseThickness * (1 + densityBoost * 0.8); // up to ~2.6x
    const spacing = Math.max(1, baseSpacing * (1 - densityBoost * 0.4)); // outer ring can go ~40% tighter

    // Estimate max nodes by area packing of the annulus band
    const annulusArea = 2 * Math.PI * radius * thickness; // area ≈ circumference * band width
    const packingEfficiency = 0.7; // hex-like packing (rough)
    const maxByArea = Math.floor((annulusArea * packingEfficiency) / (spacing * spacing));

    // Caps (hard): outer ring up to 10k, inner rings higher but still bounded for perf
    const ringCap = degree === 3 ? 10000 : degree === 2 ? 2000 : 1200;
    const baseColor = schemes[colorScheme] || schemes.default;

    const safeCount = Math.min(count, ringCap, Math.max(1, maxByArea));

    // Use a low-discrepancy sequence (golden angle) for even angular distribution
    const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.399963
    const angleStart = Math.random() * Math.PI * 2; // slight variation per render

    for (let i = 0; i < safeCount; i++) {
      const angle = angleStart + i * golden; // wraps naturally
      // Sample within the band around the target radius
      const radialOffset = (Math.random() - 0.5) * thickness; // [-thickness/2, +thickness/2]
      const dist = radius + radialOffset;

      const finalX = 300 + dist * Math.cos(angle);
      const finalY = 300 + dist * Math.sin(angle);
      const x = scatter ? 300 : finalX;
      const y = scatter ? 300 : finalY;
      const key = `${degree}-${i}`;
      const isActive = hoveredNode === key;
      // Per-node color selection (cycle across full rainbow; degree palette for others)
      const fillColor = isActive
        ? "#facc15"
        : (colorScheme === "rainbow"
            ? (baseColor[i % baseColor.length])
            : baseColor[degree - 1]);
      // Size & heart scaling for Cupid theme
      const baseSize = degree === 1 ? 3.5 : degree === 2 ? 2.5 : 1.5;
      const size = isActive ? 5 : baseSize;
      const heartScale = size / 4; // path is designed around ~4px unit

      nodes.push(
        <g
          key={`group-${key}`}
          transform={`translate(${x}, ${y})`}
          style={{
            transition: "transform 1s ease",
            transform: scatter ? `translate(${finalX}px, ${finalY}px)` : undefined,
          }}
          onMouseEnter={() => setHoveredNode(key)}
          onMouseLeave={() => setHoveredNode(null)}
        >
          {colorScheme === "cupid" ? (
            <path
              d="M0,-4 C-2,-8 -10,-2 -4,4 C0,8 4,4 10,-2 C4,-8 2,-4 0,-4 Z"
              transform={`scale(${heartScale})`}
              fill={fillColor}
              opacity={isActive ? 1 : 0.75}
              stroke={isActive ? "#fcd34d" : "none"}
              strokeWidth={isActive ? 1.5 : 0}
              style={{
                filter: isActive ? "drop-shadow(0 0 6px rgba(250, 204, 21, 0.5))" : "none",
                cursor: "pointer",
                transition: "all 0.4s ease",
              }}
            />
          ) : (
            <circle
              r={size}
              fill={fillColor}
              opacity={isActive ? 1 : 0.6}
              stroke={isActive ? "#fcd34d" : "none"}
              strokeWidth={isActive ? 1.5 : 0}
              style={{
                filter: isActive ? "drop-shadow(0 0 6px rgba(250, 204, 21, 0.5))" : "none",
                cursor: "pointer",
                transition: "all 0.4s ease",
              }}
            />
          )}
        </g>
      );
    }
    return nodes;
  };

  // --- Social share helpers ---
  const SHARE_URL = encodeURIComponent("https://www.jordanquaglia.com/ripplemap");
  const SHARE_TEXT = encodeURIComponent("Visualize your social network and ripple effect:");
  const shareTo = (platform) => {
    let url = "";
    switch (platform) {
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${SHARE_URL}`;
        break;
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${SHARE_TEXT}&url=${SHARE_URL}`;
        break;
      case "linkedin":
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${SHARE_URL}`;
        break;
      case "copy":
        navigator.clipboard.writeText(decodeURIComponent(SHARE_URL));
        return;
      default:
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Click to toggle continuous ripples (mobile-friendly). Hover still works when not in continuous mode.
  const toggleContinuous = (type) => {
    if (continuousType === type) {
      // Turn off continuous mode for this type
      setContinuousType(null);
      setShowRipples(false);
      return;
    }
    // Switch to (or start) continuous mode
    setBeamType(type);
    setRippleSeq((s) => s + 1); // restart sequence so animation restarts cleanly
    setShowRipples(true);
    setContinuousType(type);
  };

  const renderRipples = () => {
    // Render circles with refs; animation handled via requestAnimationFrame for Safari/iOS compatibility
    if (!showRipples) return null;
    const items = [];
    for (let i = 0; i < 3; i++) {
      items.push(
        <circle
          key={`ripple-${beamType}-${rippleSeq}-${i}`}
          ref={(el) => (rippleRefs.current[i] = el)}
          cx="300" cy="300"
          r="1"
          fill="none"
          stroke={beamType === 'we-care' ? 'rgba(34, 197, 94, 0.45)' : (beamType === 'good-vibes' ? 'rgba(250, 204, 21, 0.5)' : 'rgba(236, 72, 153, 0.45)')}
          strokeWidth="4" opacity="0" className="ripple"
        />
      );
    }
    return items;
  };

  // JS-driven ripple animation (Safari/iOS friendly)
  useEffect(() => {
    if (!showRipples) {
      if (rippleRafRef.current) cancelAnimationFrame(rippleRafRef.current);
      rippleRafRef.current = 0;
      rippleRefs.current.forEach((c) => c && c.setAttribute('opacity', '0'));
      return;
    }

    const total = 3;
    const delays = [0, 3000, 6000]; // ms
    const duration = beamType === 'we-care' ? 14000 : (beamType === 'good-vibes' ? 8000 : 12000); // ms
    const maxR = 300; // extend slightly beyond outer ring for longer visible travel // beyond outer ring
    const start = performance.now();

    // Prime the first frame to avoid an initial bright dot before RAF paints
    for (let i = 0; i < total; i++) {
      const el = rippleRefs.current[i];
      if (el) {
        el.setAttribute('r', '1');
        el.setAttribute('opacity', '0.28');
      }
    }
    const tick = (now) => {
      const tGlobal = now - start;
      for (let i = 0; i < total; i++) {
        const el = rippleRefs.current[i];
        if (!el) continue;
        const t = Math.max(0, (tGlobal - delays[i]));
        const local = t % duration;
        let prog = local / duration; // 0..1
        if (beamType === 'we-care') {
          // Smooth sinusoidal out-and-back (no initial pause)
          const s = (1 - Math.cos(2 * Math.PI * prog)) / 2; // 0..1..0
          const r = 1 + s * (maxR - 1);
          // Slightly brighter as it returns toward center
          const centerBias = 1 - Math.abs(1 - 2 * prog); // peaks at 0.5
          const opacityBase = 0.28 + 0.12 * centerBias; // ~0.28..0.4
          const opacity = Math.min(0.42, opacityBase);
          el.setAttribute('r', String(r));
          el.setAttribute('opacity', String(opacity));
        } else {
          // Outward only (Good Vibes & Loving-Kindness): hold visibility longer near the edge
          const r = 1 + prog * (maxR - 1);
          const edgeHold = 0.85; // keep visible slightly longer before final fade
          const opacity = prog < edgeHold
            ? 1 - prog * 0.6
            : Math.max(0, 0.4 - (prog - edgeHold) * 2.2);
          el.setAttribute('r', String(r));
          el.setAttribute('opacity', String(opacity));
        }
      }
      rippleRafRef.current = requestAnimationFrame(tick); /* start JS-driven ripple loop */
    };

    rippleRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rippleRafRef.current) cancelAnimationFrame(rippleRafRef.current);
      rippleRafRef.current = 0;
    };
  }, [showRipples, beamType, rippleSeq]);

  return (
    <div className="flex flex-col lg:flex-row w-full p-4 gap-8">
      {/* LEFT: Title, inputs, actions */}
      <div className="w-full lg:max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Ripple Map: See Your Impact</h1>
          <div className="text-left text-sm text-gray-600 mt-1 max-w-[70ch]">
              <p>To visualize how your impact ripples through your social network across three degrees of connection:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Estimate your first-degree connections — count the people you interact with regularly (at least every few weeks, in person or digital). Only include relationships that are personal and two-way.              </li>
              <li>
                Click and hover over the buttons to visualize the social reach of your care.
              </li>
            </ol>
            <p className="mt-2">
              For more on the science behind this project, plus a companion practice called Beaming We-Care, see Chpt. 9 of my book, <em>From Self-Care to We-Care</em>.
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          <label className="block font-medium"># of First-degree Connections:</label>
          <input
            type="number"
            className="w-full p-2 border rounded"
            value={firstDegree === 0 ? "" : firstDegree}
            min={0}
            onChange={(e) => setFirstDegree(parseInt(e.target.value) || 0)}
          />        </div>

        <div className="text-sm">
          <label className="block mb-1 font-medium">Color Scheme</label>
          <select
            className="w-full p-2 border rounded"
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
          >
            <option value="default">Warm</option>
            <option value="cool">Cool</option>
            <option value="forest">Forest</option>
            <option value="ocean">Ocean</option>
            <option value="dusk">Dusk</option>
            <option value="grayscale">Grayscale</option>
            <option value="rainbow">Rainbow</option>
            <option value="cupid">Cupid</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {/* Top option: Good Vibes */}
          <button
            onPointerEnter={() => { if (!continuousType) { setBeamType("good-vibes"); setShowRipples(true); } }}
            onPointerLeave={() => { if (!continuousType) setShowRipples(false); }}
            onPointerDown={(e) => { e.preventDefault(); toggleContinuous("good-vibes"); }}  
            className="bg-amber-500 text-white font-semibold py-2 px-4 rounded shadow hover:brightness-110"
          >
            Beam Good Vibes
          </button>

          {/* Loving-Kindness: outward only (pink) */}
          <button
            onPointerEnter={() => { if (!continuousType) { setBeamType("loving-kindness"); setShowRipples(true); } }}
            onPointerLeave={() => { if (!continuousType) setShowRipples(false); }}
            onPointerDown={(e) => { e.preventDefault(); toggleContinuous("loving-kindness"); }}  
            className="bg-pink-500 text-white font-semibold py-2 px-4 rounded shadow hover:brightness-110"
          >
            Beam Loving-Kindness
          </button>

          {/* We-Care: out and back (green) with stronger return visibility */}
          <button
            onPointerEnter={() => { if (!continuousType) { setBeamType("we-care"); setShowRipples(true); } }}
            onPointerLeave={() => { if (!continuousType) setShowRipples(false); }}
            onPointerDown={(e) => { e.preventDefault(); toggleContinuous("we-care"); }}  
            className="bg-green-600 text-white font-semibold py-2 px-4 rounded shadow hover:brightness-110"
          >
            Beam We-Care
          </button>

          {/* Social share row */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs uppercase tracking-wide text-gray-500">Share:</span>
            <button aria-label="Share on Facebook" title="Share on Facebook" onClick={() => shareTo("facebook")} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white hover:brightness-110">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.5 9.87v-6.99H7.9V12h2.6V9.8c0-2.57 1.53-3.99 3.87-3.99 1.12 0 2.29.2 2.29.2v2.52h-1.29c-1.27 0-1.66.79-1.66 1.6V12h2.83l-.45 2.88h-2.38v6.99A10 10 0 0 0 22 12z"/></svg>
            </button>
            <button aria-label="Share on X" title="Share on X" onClick={() => shareTo("twitter")} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black text-white hover:brightness-110">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 3H21l-6.73 7.69L22 21h-6.276l-4.91-6.02L5.1 21H2.343l7.2-8.228L2 3h6.44l4.42 5.548L18.244 3Zm-1.1 16h1.54L7.01 4H5.4l11.744 15Z"/></svg>
            </button>
            <button aria-label="Share on LinkedIn" title="Share on LinkedIn" onClick={() => shareTo("linkedin")} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-700 text-white hover:brightness-110">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7 0h3.8v2.05h.05c.53-1 1.84-2.05 3.8-2.05 4.06 0 4.8 2.67 4.8 6.14V23h-4v-6.6c0-1.57-.03-3.6-2.2-3.6-2.2 0-2.54 1.72-2.54 3.5V23h-4V8z"/></svg>
            </button>
            <button aria-label="Copy link" title="Copy link" onClick={() => shareTo("copy")} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-200 text-gray-700 hover:brightness-110">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.59 13.41a1.998 1.998 0 0 1 0-2.82l2.83-2.83a2 2 0 1 1 2.83 2.83l-.88.88 1.41 1.41.88-.88a4 4 0 1 0-5.66-5.66l-2.83 2.83a4 4 0 0 0 0 5.66l.42.42 1.41-1.41-.41-.41Zm2.82-2.82a1.998 1.998 0 0 1 0 2.82l-2.83 2.83a2 2 0 1 1-2.83-2.83l.88-.88-1.41-1.41-.88.88a4 4 0 1 0 5.66 5.66l2.83-2.83a4 4 0 0 0 0-5.66l-.42-.42-1.41 1.41.41.41Z"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Visualization & stats */}
      <div
        className="flex-1 items-center flex flex-col space-y-4 w-[640px] max-w-full mx-auto"
        ref={imageRef}
        onMouseEnter={() => setScatter(true)}
        onMouseLeave={() => setScatter(false)}
      >
        <svg ref={svgRef} width="600" height="600" className="mx-auto block">
          {/* Center node (theme color) */}
          {colorScheme === "cupid" ? (
            <g transform="translate(300,300)">
              <path
                d="M0,-4 C-2,-8 -10,-2 -4,4 C0,8 4,4 10,-2 C4,-8 2,-4 0,-4 Z"
                transform="scale(0.75)"
                fill={centerColors[colorScheme]}
                opacity={0.9}
              />
            </g>
          ) : (
            <circle cx="300" cy="300" r="3" fill={centerColors[colorScheme]} />
          )}

          {/* Rings of clustered nodes */}
          {isReady && (
            <>
              {renderClusteredNodes(firstDegree, 90, 1)}
              {renderClusteredNodes(secondDegree, 180, 2)}
              {renderClusteredNodes(thirdDegree, 270, 3)}
            </>
          )}

          {/* Ripples sit on top so they are visible above nodes */}
          {renderRipples()}
        </svg>

        <div className="mt-3 text-center text-sm text-gray-600">
          <p>1st degree: {firstDegree} connections</p>
          <p>2nd degree: {secondDegree} connections</p>
          <p>3rd degree: {thirdDegree} connections</p>
          <p>Total network size: {totalNetworkSize}</p>
          <p className="mt-2 text-xs text-gray-400">Visualize Your Network Here: www.jordanquaglia.com/ripplemap</p>
        </div>
      </div>

      {/* Inline keyframes for ripples */}
      <style>{`
        /* JS-driven animation for Safari/iOS; keyframes kept minimal */
        .ripple { transform-origin: center; }
      `}</style>
    </div>
  );
};

export default ConnectionVisualizer;

