// Navigator+ Vitality / Zeb's Crossing - client-side certificate (no server / no email).
window.ZebCertificate = (function(){
  function esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: 297mm 210mm;
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 297mm;
    height: 210mm;
    font-family: 'Poppins', 'Segoe UI', Verdana, sans-serif;
  }
  .sheet {
    position: relative;
    width: 297mm;
    height: 210mm;
    box-sizing: border-box;
    background: linear-gradient(160deg, #fbf7ee 0%, #f2ede0 55%, #eef2e6 100%);
    overflow: hidden;
  }
  .confetti {
    position: absolute;
    border-radius: 50%;
    z-index: 0;
    opacity: 0.5;
  }
  .border-outer {
    position: absolute;
    inset: 8mm;
    border: 3mm solid #7fa88f;
    border-radius: 12mm;
    box-sizing: border-box;
  }
  .border-inner {
    position: absolute;
    inset: 12.5mm;
    border: 1.1mm dashed #e0a944;
    border-radius: 9mm;
    box-sizing: border-box;
  }
  .road-strip {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 13mm;
    background: #4f6d5a;
    z-index: 0;
  }
  .road-strip.bottom {
    top: auto;
    bottom: 0;
  }
  .road-strip::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 2mm;
    margin-top: -1mm;
    background-image: repeating-linear-gradient(
      to right,
      #f0d9a0 0mm, #f0d9a0 12mm, transparent 12mm, transparent 22mm
    );
  }
  .corner-icon {
    position: absolute;
    z-index: 3;
  }
  .corner-icon.tl { top: 15mm; left: 15mm; width: 18mm; height: 18mm; }
  .corner-icon.tr { top: 15mm; right: 15mm; width: 18mm; height: 18mm; }
  .corner-icon.bl { bottom: 15mm; left: 10mm; width: 14mm; height: 14mm; }
  .corner-icon.br { bottom: 15mm; right: 10mm; width: 14mm; height: 14mm; }
  .content {
    position: relative;
    z-index: 2;
    padding: 22mm 26mm 0 26mm;
    text-align: center;
    box-sizing: border-box;
  }
  .logo-slot {
    height: 16mm;
    margin: 0 auto 2mm auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logo-slot img {
    height: 16mm;
    width: auto;
  }
  .badge-line {
    font-size: 11pt;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #d97a4a;
    font-weight: 700;
    margin-bottom: 2mm;
  }
  .mascot-row {
    display: block;
    margin: 0 auto 2mm auto;
    height: 20mm;
  }
  h1.title {
    font-size: 31pt;
    color: #35473d;
    margin: 0 0 3mm 0;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .subtitle {
    font-size: 12pt;
    color: #6a7268;
    margin-bottom: 7mm;
    font-style: italic;
  }
  .presented-to {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #8b8f86;
    margin-bottom: 2mm;
  }
  .name-line {
    font-size: 26pt;
    font-weight: 700;
    color: #d97a4a;
    font-family: 'Brush Script MT', 'Segoe Script', cursive;
    border-bottom: 0.7mm dashed #e0a944;
    display: inline-block;
    padding: 0 14mm 2mm 14mm;
    margin-bottom: 6mm;
    min-width: 140mm;
  }
  .body-text {
    font-size: 12pt;
    color: #4a4f47;
    line-height: 1.6;
    max-width: 200mm;
    margin: 0 auto 5mm auto;
  }
  .challenge-name {
    font-weight: 700;
    color: #35473d;
  }
  .certify-text {
    font-size: 13.5pt;
    margin-top: 4mm;
    margin-bottom: 8mm;
  }
  .stars {
    font-size: 15pt;
    letter-spacing: 4mm;
    color: #e0a944;
    margin-bottom: 4mm;
  }
  .footer {
    position: absolute;
    bottom: 22mm;
    left: 0;
    right: 0;
    height: 20mm;
    z-index: 2;
  }
  .footer-block {
    position: absolute;
    bottom: 0;
    width: 58mm;
    text-align: center;
    box-sizing: border-box;
  }
  .footer-block.left { left: 26mm; }
  .footer-block.right { right: 26mm; }
  .footer-block.center {
    left: 50%;
    margin-left: -19mm;
    width: 38mm;
  }
  .footer-line {
    border-top: 0.4mm dashed #c7c2b0;
    margin-bottom: 1.5mm;
  }
  .footer-label {
    font-size: 8.5pt;
    color: #9a9789;
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
  }
  .footer-value {
    font-size: 9.5pt;
    color: #35473d;
    font-weight: 600;
    margin-bottom: 1.5mm;
    line-height: 1.25;
    overflow-wrap: break-word;
  }
  .seal-star {
    width: 38mm;
    height: 38mm;
    margin: 0 auto;
    display: block;
  }
  .signature-img {
    width: 44mm;
    height: 13mm;
    display: block;
    margin: 0 auto 1mm auto;
  }
  .cert-id {
    position: absolute;
    bottom: 17mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8pt;
    color: #b0ab9a;
    z-index: 2;
  }
  .cert-id b { color: #35473d; letter-spacing: 1.5px; font-size: 9pt; }
  .brand-lockup { display:flex; align-items:center; justify-content:center; gap:5mm; margin: 3mm auto 6mm; }
  .brand-mascot { width:22mm; height:22mm; flex:none; }
  .brand-text { text-align:left; }
  .brand-name { font-family:'Poppins','Segoe UI',sans-serif; font-size:27pt; font-weight:800; color:#35473d; line-height:1; position:relative; white-space:nowrap; }
  .brand-name .pin { position:relative; display:inline-block; }
  .brand-name .pin::before { content:''; position:absolute; left:50%; top:0.05em; width:0.2em; height:0.2em; background:#d64545; border-radius:50% 50% 50% 0; transform:translateX(-50%) rotate(-45deg); box-shadow:0 0.3mm 0.5mm rgba(0,0,0,.2); }
  .brand-plus { color:#d97a4a; font-size:15pt; font-weight:700; margin-left:2mm; }
  .brand-tag { font-size:10.5pt; letter-spacing:2.5px; text-transform:uppercase; color:#8b8f86; font-weight:700; margin-top:1.5mm; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="road-strip"></div>
    <div class="road-strip bottom"></div>
    <div class="border-outer"></div>
    <div class="border-inner"></div>
    <div class="confetti" style="width:5mm;height:5mm;background:#e0a944;top:22mm;left:40mm;"></div>
    <div class="confetti" style="width:3mm;height:3mm;background:#d97a4a;top:34mm;left:255mm;"></div>
    <div class="confetti" style="width:4mm;height:4mm;background:#7fa88f;top:60mm;left:30mm;"></div>
    <div class="confetti" style="width:3.5mm;height:3.5mm;background:#d97a4a;top:170mm;left:245mm;"></div>
    <div class="confetti" style="width:4.5mm;height:4.5mm;background:#e0a944;top:175mm;left:45mm;"></div>
    <div class="confetti" style="width:3mm;height:3mm;background:#7fa88f;top:26mm;left:220mm;"></div>
    <svg class="corner-icon tl" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#eef2e6"/><circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" stroke-width="3"/><ellipse cx="32" cy="38" rx="11" ry="9" fill="#7fa88f"/><ellipse cx="18" cy="24" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(-20 18 24)"/><ellipse cx="29" cy="16" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(-8 29 16)"/><ellipse cx="42" cy="16" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(8 42 16)"/><ellipse cx="47" cy="26" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(20 47 26)"/></svg>
    <svg class="corner-icon tr" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#faf1de"/><circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" stroke-width="3"/><ellipse cx="32" cy="38" rx="11" ry="9" fill="#e0a944"/><ellipse cx="18" cy="24" rx="5" ry="6.5" fill="#e0a944" transform="rotate(-20 18 24)"/><ellipse cx="29" cy="16" rx="5" ry="6.5" fill="#e0a944" transform="rotate(-8 29 16)"/><ellipse cx="42" cy="16" rx="5" ry="6.5" fill="#e0a944" transform="rotate(8 42 16)"/><ellipse cx="47" cy="26" rx="5" ry="6.5" fill="#e0a944" transform="rotate(20 47 26)"/></svg>
    <svg class="corner-icon bl" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fbe9e0"/><circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" stroke-width="3"/><ellipse cx="32" cy="38" rx="11" ry="9" fill="#d97a4a"/><ellipse cx="18" cy="24" rx="5" ry="6.5" fill="#d97a4a" transform="rotate(-20 18 24)"/><ellipse cx="29" cy="16" rx="5" ry="6.5" fill="#d97a4a" transform="rotate(-8 29 16)"/><ellipse cx="42" cy="16" rx="5" ry="6.5" fill="#d97a4a" transform="rotate(8 42 16)"/><ellipse cx="47" cy="26" rx="5" ry="6.5" fill="#d97a4a" transform="rotate(20 47 26)"/></svg>
    <svg class="corner-icon br" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#eef2e6"/><circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" stroke-width="3"/><ellipse cx="32" cy="38" rx="11" ry="9" fill="#7fa88f"/><ellipse cx="18" cy="24" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(-20 18 24)"/><ellipse cx="29" cy="16" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(-8 29 16)"/><ellipse cx="42" cy="16" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(8 42 16)"/><ellipse cx="47" cy="26" rx="5" ry="6.5" fill="#7fa88f" transform="rotate(20 47 26)"/></svg>
    <div class="content">
      <div class="brand-lockup">
        <svg class="brand-mascot" viewBox="0 0 100 90"><ellipse cx="50" cy="83" rx="27" ry="4" fill="#35473d" opacity="0.08"/><circle cx="27" cy="21" r="11.5" fill="#a6a4b3"/><circle cx="73" cy="21" r="11.5" fill="#a6a4b3"/><circle cx="27" cy="22" r="6.5" fill="#d6d4de"/><circle cx="73" cy="22" r="6.5" fill="#d6d4de"/><circle cx="50" cy="48" r="33" fill="#bcbac8"/><path d="M21 42 C21 30, 33 24, 50 27 C67 24, 79 30, 79 42 C79 47, 73 50, 65 49 C60 48.3, 57 44, 50 44 C43 44, 40 48.3, 35 49 C27 50, 21 47, 21 42 Z" fill="#736f83"/><ellipse cx="39" cy="40" rx="4.6" ry="5.6" fill="#26242f"/><ellipse cx="61" cy="40" rx="4.6" ry="5.6" fill="#26242f"/><circle cx="37.6" cy="37.8" r="1.4" fill="#ffffff"/><circle cx="59.6" cy="37.8" r="1.4" fill="#ffffff"/><ellipse cx="50" cy="57" rx="17" ry="13.5" fill="#f4f2ec"/><ellipse cx="50" cy="52" rx="4.2" ry="3.2" fill="#2b2a35"/><path d="M50 55.5 Q50 59 50 60" stroke="#2b2a35" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M50 60 Q45 63.5 40.5 60.5" fill="none" stroke="#2b2a35" stroke-width="1.4" stroke-linecap="round"/><path d="M50 60 Q55 63.5 59.5 60.5" fill="none" stroke="#2b2a35" stroke-width="1.4" stroke-linecap="round"/></svg>
        <div class="brand-text">
          <div class="brand-name">Nav<span class="pin">&#305;</span>gator<span class="brand-plus">+ Vitality</span></div>
          <div class="brand-tag">Road Safety Challenge</div>
        </div>
      </div>
      <h1 class="title">Certificate of Completion</h1>
      <div class="subtitle">Awarded for mastering the rules of the road!</div>
      <div class="body-text certify-text">
        This certifies that the <span class="challenge-name">{{CHALLENGE_NAME}}</span> challenge
        has been successfully completed, demonstrating knowledge and commitment
        to safer roads for everyone.
      </div>
    </div>
    <div class="footer">
      <div class="footer-block left">
        <div class="footer-value">{{DATE}}</div>
        <div class="footer-label">Date Completed</div>
      </div>
      <div class="footer-block center">
        <svg class="seal-star" viewBox="0 0 100 100">
          <defs>
            <radialGradient id="sealGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stop-color="#fff0c2"/>
              <stop offset="55%" stop-color="#e0a944"/>
              <stop offset="100%" stop-color="#7fa88f"/>
            </radialGradient>
          </defs>
          <path d="M 50.0,4.0 L 61.17,34.63 L 93.75,35.79 L 68.07,55.87 L 77.04,87.21 L 50.0,69.0 L 22.96,87.21 L 31.93,55.87 L 6.25,35.79 L 38.83,34.63 Z" fill="url(#sealGrad)"/>
          <text x="50" y="47" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="800" font-size="9.5" fill="#ffffff">OFFICIAL</text>
          <text x="50" y="58" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="800" font-size="9.5" fill="#ffffff">SEAL</text>
        </svg>
      </div>
      <div class="footer-block right">
        <svg class="signature-img" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M6,34 C10,18 14,10 18,14 C22,18 20,32 24,32 C28,32 30,12 35,10
                   C40,8 42,26 47,28 C52,30 56,10 62,9 C68,8 68,26 73,28
                   C78,30 80,15 86,13 C90,11.5 92,22 97,23 C104,24.5 108,14 113,12
                   C118,10 120,20 126,20 C132,20 136,11 141,9"
                fill="none" stroke="#35473d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14,38 C40,44 90,44 130,36" fill="none" stroke="#d97a4a" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <div class="footer-line"></div>
        <div class="footer-value">{{ISSUER_NAME}}</div>
        <div class="footer-label">Issued By / Signature</div>
      </div>
    </div>
    <div class="cert-id">Unique code: <b>{{CERT_ID}}</b></div>
  </div>
</body>
</html>
`;
  var TOOLBAR = '<style>@media print{.zc-bar{display:none!important}}</style>'
    + '<div class="zc-bar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#4f6d5a;color:#fff;'
    + 'font-family:Segoe UI,Arial,sans-serif;font-size:14px;padding:9px 14px;display:flex;gap:12px;align-items:center;justify-content:center;">'
    + 'Your certificate is ready &nbsp;'
    + '<button onclick="window.print()" style="background:#e0a944;border:none;border-radius:8px;padding:6px 16px;font-weight:700;cursor:pointer;color:#4a3300;">Save as PDF / Print</button>'
    + '<span style="opacity:.85">Tip: pick &ldquo;Save as PDF&rdquo; as the destination.</span></div>';
  function fill(d){
    d = d || {};
    var code = d.certCode || d.certId || 'ZC-XXXX-XXXX';
    return TEMPLATE
      .replace(/{{CERT_ID}}/g,        esc(code))
      .replace(/{{CERT_CODE}}/g,      esc(code))
      .replace(/{{CHALLENGE_NAME}}/g, esc(d.challengeName || 'Road Safety'))
      .replace(/{{DATE}}/g,           esc(d.date || new Date().toLocaleDateString('en-GB')))
      .replace(/{{ISSUER_NAME}}/g,    esc(d.issuerName || "Navigator+ Vitality"));
  }
  function download(d){
    var html = fill(d).replace('<body>', '<body>' + TOOLBAR);
    var w = window.open('', '_blank');
    if (!w) return false;
    w.document.open(); w.document.write(html); w.document.close();
    var go = function(){ try { w.focus(); w.print(); } catch(e){} };
    if (w.document.readyState === 'complete') setTimeout(go, 400);
    else w.onload = function(){ setTimeout(go, 400); };
    return true;
  }
  return { fill: fill, download: download };
})();
