// ─── HEAD-TO-HEAD ────────────────────────────────────────────────

function computeH2H(matches, p1Key, p2Key) {
  const h2h = matches.filter(m =>
    (m.aKey === p1Key && m.bKey === p2Key) ||
    (m.aKey === p2Key && m.bKey === p1Key)
  );

  let wins1 = 0, wins2 = 0, draws = 0, legs1 = 0, legs2 = 0;
  let avg1 = [], avg2 = [];

  h2h.forEach(m => {
    const p1isA = m.aKey === p1Key;
    const p1legs = p1isA ? m.legsA : m.legsB;
    const p2legs = p1isA ? m.legsB : m.legsA;
    legs1 += p1legs;
    legs2 += p2legs;

    if (p1legs > p2legs) wins1++;
    else if (p2legs > p1legs) wins2++;
    else draws++;

    const p1avg = p1isA ? m.avgA : m.avgB;
    const p2avg = p1isA ? m.avgB : m.avgA;
    if (p1avg != null) avg1.push(p1avg);
    if (p2avg != null) avg2.push(p2avg);
  });

  return {
    matches: h2h.length,
    wins1, wins2, draws,
    legs1, legs2,
    avg1: avg1.length ? (avg1.reduce((a,b)=>a+b,0)/avg1.length) : null,
    avg2: avg2.length ? (avg2.reduce((a,b)=>a+b,0)/avg2.length) : null
  };
}

function barRow(label, left, right) {
  const max = Math.max(left, right, 1);
  const leftPct = (left / max) * 50;
  const rightPct = (right / max) * 50;
  return `
    <div class="stat-row">
      <div class="stat-row-title">${label}</div>
      <div class="stat-row-grid">
        <div class="val">${left}</div>
        <div class="track">
          <div class="bar-left" style="width:${leftPct}%"></div>
          <div class="bar-right" style="width:${rightPct}%"></div>
        </div>
        <div class="val">${right}</div>
      </div>
    </div>
  `;
}

function barRowAvg(label, left, right) {
  return barRow(label, Number(left.toFixed(2)), Number(right.toFixed(2)));
}

async function initH2H() {
  try {
    const { matches, nameStats, keys } = await getSharedData();

    const p1 = document.getElementById("p1");
    const p2 = document.getElementById("p2");

    keys.forEach(key => {
      const name = nameStats.get(key).displayName;
      p1.add(new Option(name, key));
      p2.add(new Option(name, key));
    });

    document.getElementById("h2h-loading").style.display = "none";
    document.getElementById("h2h-content").style.display = "block";

    function update() {
      const k1 = p1.value;
      const k2 = p2.value;
      if (!k1 || !k2 || k1 === k2) return;

      const h2h = computeH2H(matches, k1, k2);

      document.getElementById("nameL").textContent = nameStats.get(k1).displayName;
      document.getElementById("nameR").textContent = nameStats.get(k2).displayName;

      document.getElementById("h2h-pills").innerHTML = `
        <div class="pill">Zápasy: ${h2h.matches}</div>
        <div class="pill">Remízy: ${h2h.draws}</div>
      `;

      const rows = [];
      rows.push(barRow("Výhry", h2h.wins1, h2h.wins2));
      rows.push(barRow("Legy", h2h.legs1, h2h.legs2));
      if (h2h.avg1 != null || h2h.avg2 != null) {
        rows.push(barRowAvg("Priemer (3 šípok)", h2h.avg1 || 0, h2h.avg2 || 0));
      }

      document.getElementById("h2h-rows").innerHTML = rows.join("");
    }

    p1.addEventListener("change", update);
    p2.addEventListener("change", update);

    if (keys.length >= 2) {
      p1.value = keys[0];
      p2.value = keys[1];
      update();
    }
  } catch (err) {
    document.getElementById("h2h-loading").style.display = "none";
    document.getElementById("h2h-error").textContent =
      "Nepodarilo sa načítať dáta: " + err.message;
  }
}

initH2H();
