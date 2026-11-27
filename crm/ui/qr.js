/* Inline QR for the lobby codes. Alphanumeric, version 2, error correction M.
   No network calls. The picture is an SVG of the modules. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrmQr = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  var EXP = new Array(512);
  var LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(degree) {
    var gen = [1];
    for (var i = 0; i < degree; i++) {
      var next = [];
      for (var j = 0; j < gen.length; j++) next.push(0);
      next.push(0);
      for (var k = 0; k < gen.length; k++) {
        next[k] ^= gen[k];
        next[k + 1] ^= gfMul(gen[k], EXP[i]);
      }
      gen = next;
    }
    return gen;
  }

  function rsRemainder(data, degree) {
    var gen = rsGenerator(degree);
    var out = data.slice();
    for (var i = 0; i < degree; i++) out.push(0);
    for (var n = 0; n < data.length; n++) {
      var coef = out[n];
      if (coef === 0) continue;
      for (var j = 0; j < gen.length; j++) out[n + j] ^= gfMul(gen[j], coef);
    }
    return out.slice(data.length);
  }

  function pushBits(bits, value, length) {
    for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function dataCodewords(text) {
    if (!text || text.length > 32) throw new Error('QR text is too long.');
    var bits = [];
    pushBits(bits, 0b0010, 4);
    pushBits(bits, text.length, 9);
    for (var i = 0; i < text.length; i += 2) {
      var a = ALPHA.indexOf(text.charAt(i));
      if (a < 0) throw new Error('QR text must be uppercase alphanumeric.');
      if (i + 1 < text.length) {
        var b = ALPHA.indexOf(text.charAt(i + 1));
        if (b < 0) throw new Error('QR text must be uppercase alphanumeric.');
        pushBits(bits, a * 45 + b, 11);
      } else pushBits(bits, a, 6);
    }
    var capacity = 28 * 8;
    var term = Math.min(4, capacity - bits.length);
    pushBits(bits, 0, term);
    while (bits.length % 8) bits.push(0);
    var bytes = [];
    for (var p = 0; p < bits.length; p += 8) {
      var value = 0;
      for (var k = 0; k < 8; k++) value = (value << 1) | bits[p + k];
      bytes.push(value);
    }
    var pad = 0xec;
    while (bytes.length < 28) {
      bytes.push(pad);
      pad = pad === 0xec ? 0x11 : 0xec;
    }
    if (bytes.length !== 28) throw new Error('QR data does not fit.');
    return bytes;
  }

  function empty(n) {
    var rows = [];
    for (var y = 0; y < n; y++) {
      var row = [];
      for (var x = 0; x < n; x++) row.push(0);
      rows.push(row);
    }
    return rows;
  }

  function reservedGrid(n) {
    var rows = [];
    for (var y = 0; y < n; y++) {
      var row = [];
      for (var x = 0; x < n; x++) row.push(false);
      rows.push(row);
    }
    return rows;
  }

  function drawFinder(modules, reserved, ox, oy, n) {
    for (var dy = -1; dy <= 7; dy++) {
      for (var dx = -1; dx <= 7; dx++) {
        var x = ox + dx;
        var y = oy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        var inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        var dark = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        modules[y][x] = dark ? 1 : 0;
        reserved[y][x] = true;
      }
    }
  }

  function drawAlignment(modules, reserved, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
        modules[cy + dy][cx + dx] = dark ? 1 : 0;
        reserved[cy + dy][cx + dx] = true;
      }
    }
  }

  function formatBits(mask) {
    var data = mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
  }

  function reserveFormat(reserved, n) {
    var i;
    for (i = 0; i <= 5; i++) reserved[i][8] = true;
    reserved[7][8] = true;
    reserved[8][8] = true;
    reserved[8][7] = true;
    for (i = 9; i < 15; i++) reserved[8][14 - i] = true;
    for (i = 0; i < 8; i++) reserved[8][n - 1 - i] = true;
    for (i = 8; i < 15; i++) reserved[n - 15 + i][8] = true;
    reserved[n - 8][8] = true;
  }

  function drawFormat(modules, mask) {
    var n = modules.length;
    var bits = formatBits(mask);
    function bit(i) { return (bits >>> i) & 1; }
    var i;
    for (i = 0; i <= 5; i++) modules[i][8] = bit(i);
    modules[7][8] = bit(6);
    modules[8][8] = bit(7);
    modules[8][7] = bit(8);
    for (i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
    for (i = 0; i < 8; i++) modules[8][n - 1 - i] = bit(i);
    for (i = 8; i < 15; i++) modules[n - 15 + i][8] = bit(i);
    modules[n - 8][8] = 1;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return ((x + y) & 1) === 0;
      case 1: return (y & 1) === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
      default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    }
  }

  function penalty(modules) {
    var n = modules.length;
    var score = 0;
    var y;
    var x;
    for (y = 0; y < n; y++) {
      var run = 1;
      for (x = 1; x < n; x++) {
        if (modules[y][x] === modules[y][x - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (x = 0; x < n; x++) {
      var colRun = 1;
      for (y = 1; y < n; y++) {
        if (modules[y][x] === modules[y - 1][x]) colRun++;
        else {
          if (colRun >= 5) score += 3 + (colRun - 5);
          colRun = 1;
        }
      }
      if (colRun >= 5) score += 3 + (colRun - 5);
    }
    for (y = 0; y < n - 1; y++) {
      for (x = 0; x < n - 1; x++) {
        var v = modules[y][x];
        if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) score += 3;
      }
    }
    function finder(bits) {
      var extra = 0;
      for (var i = 0; i + 6 < bits.length; i++) {
        if (bits[i] && !bits[i + 1] && bits[i + 2] && bits[i + 3] && bits[i + 4] && !bits[i + 5] && bits[i + 6]) {
          var left = i >= 4 && !bits[i - 1] && !bits[i - 2] && !bits[i - 3] && !bits[i - 4];
          var right = i + 10 < bits.length && !bits[i + 7] && !bits[i + 8] && !bits[i + 9] && !bits[i + 10];
          if (left || right) extra += 40;
        }
      }
      return extra;
    }
    for (y = 0; y < n; y++) score += finder(modules[y]);
    for (x = 0; x < n; x++) {
      var col = [];
      for (y = 0; y < n; y++) col.push(modules[y][x]);
      score += finder(col);
    }
    var dark = 0;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (modules[y][x]) dark++;
    score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return score;
  }

  function baseMatrix(text) {
    var n = 25;
    var modules = empty(n);
    var reserved = reservedGrid(n);
    drawFinder(modules, reserved, 0, 0, n);
    drawFinder(modules, reserved, n - 7, 0, n);
    drawFinder(modules, reserved, 0, n - 7, n);
    drawAlignment(modules, reserved, 18, 18);
    var i;
    for (i = 0; i < n; i++) {
      if (!reserved[6][i]) {
        modules[6][i] = i % 2 === 0 ? 1 : 0;
        reserved[6][i] = true;
      }
      if (!reserved[i][6]) {
        modules[i][6] = i % 2 === 0 ? 1 : 0;
        reserved[i][6] = true;
      }
    }
    modules[n - 8][8] = 1;
    reserveFormat(reserved, n);
    var data = dataCodewords(text);
    var ecc = rsRemainder(data, 16);
    var codewords = data.concat(ecc);
    var bits = [];
    codewords.forEach(function (byte) { pushBits(bits, byte, 8); });
    for (i = 0; i < 7; i++) bits.push(0);
    var open = 0;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (!reserved[y][x]) open++;
    if (open !== bits.length) throw new Error('QR module count is ' + open + ', expected ' + bits.length);
    var bit = 0;
    var upward = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col = 5;
      for (var rowStep = 0; rowStep < n; rowStep++) {
        var row = upward ? n - 1 - rowStep : rowStep;
        for (var k = 0; k < 2; k++) {
          var xx = col - k;
          if (reserved[row][xx]) continue;
          modules[row][xx] = bits[bit++];
        }
      }
      upward = !upward;
    }
    if (bit !== bits.length) throw new Error('QR did not place every bit.');
    return { modules: modules, reserved: reserved };
  }

  function clone(modules) {
    return modules.map(function (row) { return row.slice(); });
  }

  function matrix(text) {
    var base = baseMatrix(String(text || '').toUpperCase());
    var best = null;
    var bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var copy = clone(base.modules);
      var n = copy.length;
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          if (!base.reserved[y][x] && maskBit(mask, x, y)) copy[y][x] ^= 1;
        }
      }
      drawFormat(copy, mask);
      var score = penalty(copy);
      if (score < bestScore) {
        bestScore = score;
        best = copy;
      }
    }
    return best;
  }

  function svg(text, label) {
    var modules = matrix(text);
    var n = modules.length;
    var quiet = 4;
    var size = n + quiet * 2;
    var rects = [];
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (!modules[y][x]) { x++; continue; }
        var start = x;
        while (x < n && modules[y][x]) x++;
        rects.push('<rect x="' + (start + quiet) + '" y="' + (y + quiet) + '" width="' + (x - start) + '" height="1"/>');
      }
    }
    var title = label ? '<title>' + String(label).replace(/[<>&]/g, '') + '</title>' : '';
    return '<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + String(label || 'Lobby code').replace(/"/g, '') + '">' +
      title +
      '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
      '<g fill="#06090f">' + rects.join('') + '</g></svg>';
  }

  return { svg: svg, matrix: matrix, formatBits: formatBits };
});
