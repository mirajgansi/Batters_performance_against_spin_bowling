const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&family=Inter:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0F1117;color:#F0F4FF;font-family:'Inter',sans-serif;min-height:100vh}
  .app{display:flex;min-height:100vh}
  .sidebar{width:220px;min-width:220px;background:#0C1020;border-right:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;padding:24px 0;position:sticky;top:0;height:100vh}
  .sidebar-logo{padding:0 20px 24px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:16px}
  .logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#1D6FE8,#06D6A0);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
  .logo-text{font-family:'Syne',sans-serif;font-weight:700;font-size:15px;color:#F0F4FF;letter-spacing:-0.3px}
  .logo-sub{font-size:10px;color:#4E5A6E;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:1px}
  .nav-section{padding:0 12px;margin-bottom:4px}
  .nav-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#4E5A6E;font-family:'DM Mono',monospace;padding:8px 8px 4px}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;transition:all .15s;font-size:13.5px;color:#8A95A8;font-weight:500;margin-bottom:2px;border:1px solid transparent}
  .nav-item:hover{background:rgba(29,111,232,0.08);color:#C5D0E6}
  .nav-item.active{background:rgba(29,111,232,0.15);color:#4F8EF7;border-color:rgba(29,111,232,0.25)}
  .nav-icon{width:18px;text-align:center;font-size:16px}
  .main{flex:1;overflow-y:auto;background:#0F1117;min-width:0}
  .topbar{height:56px;background:#0C1020;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:10}
  .topbar-title{font-family:'Syne',sans-serif;font-weight:700;font-size:17px;flex:1}
  .topbar-badge{background:rgba(29,111,232,0.15);border:1px solid rgba(29,111,232,0.3);color:#4F8EF7;font-size:11px;font-family:'DM Mono',monospace;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px}
  .content{padding:24px 28px;max-width:1200px}
  .card{background:#161B27;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px 22px}
  .card-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:#8A95A8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
  .card-title span{font-size:16px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .stat-card{background:#1A2030;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px}
  .stat-val{font-family:'Syne',sans-serif;font-weight:800;font-size:28px;line-height:1}
  .stat-label{font-size:11px;color:#4E5A6E;text-transform:uppercase;letter-spacing:1px;font-family:'DM Mono',monospace;margin-top:4px}
  .stat-sub{font-size:12px;color:#8A95A8;margin-top:2px}
  .select-wrap{position:relative}
  .select-wrap select{appearance:none;background:#1A2030;border:1px solid rgba(255,255,255,0.1);color:#F0F4FF;padding:9px 36px 9px 12px;border-radius:9px;font-size:13.5px;cursor:pointer;width:100%;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s}
  .select-wrap select:hover,.select-wrap select:focus{border-color:rgba(29,111,232,0.5)}
  .select-wrap::after{content:'▾';position:absolute;right:12px;top:50%;transform:translateY(-50%);color:#4E5A6E;pointer-events:none;font-size:12px}
  .player-search{position:relative}
  .player-search input{width:100%;background:#1A2030;border:1px solid rgba(255,255,255,0.1);color:#F0F4FF;padding:10px 14px 10px 36px;border-radius:9px;font-size:13.5px;outline:none;transition:border-color .15s;font-family:'Inter',sans-serif}
  .player-search input:focus{border-color:rgba(29,111,232,0.5)}
  .player-search .ps-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#4E5A6E;font-size:15px}
  .dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1A2030;border:1px solid rgba(255,255,255,0.1);border-radius:10px;z-index:50;max-height:260px;overflow-y:auto;box-shadow:0 16px 40px rgba(0,0,0,0.5)}
  .dropdown-item{display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid rgba(255,255,255,0.04)}
  .dropdown-item:last-child{border-bottom:none}
  .dropdown-item:hover{background:rgba(29,111,232,0.1)}
  .player-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,0.1)}
  .player-avatar-placeholder{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1D6FE8,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0}
  .di-name{font-size:13px;font-weight:500;color:#F0F4FF}
  .di-sub{font-size:11px;color:#4E5A6E}
  .profile-hero{display:flex;align-items:center;gap:20px;padding:20px;background:linear-gradient(135deg,rgba(29,111,232,0.12),rgba(139,92,246,0.08));border:1px solid rgba(29,111,232,0.18);border-radius:14px;margin-bottom:20px}
  .profile-img{width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(29,111,232,0.4)}
  .profile-img-placeholder{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#1D6FE8,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;flex-shrink:0}
  .profile-name{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;line-height:1.2}
  .profile-short{font-size:13px;color:#4F8EF7;font-family:'DM Mono',monospace;margin-top:2px}
  .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
  .badge-rhb{background:rgba(29,111,232,0.15);color:#4F8EF7;border:1px solid rgba(29,111,232,0.25)}
  .badge-lhb{background:rgba(139,92,246,0.15);color:#A78BFA;border:1px solid rgba(139,92,246,0.25)}
  .badge-spin{background:rgba(6,214,160,0.12);color:#06D6A0;border:1px solid rgba(6,214,160,0.2)}
  .pred-card{background:linear-gradient(135deg,rgba(29,111,232,0.1),rgba(6,214,160,0.06));border:1px solid rgba(29,111,232,0.2);border-radius:14px;padding:20px 22px}
  .pred-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:600;color:#8A95A8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:16px}
  .pred-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .pred-metric{text-align:center}
  .pred-val{font-family:'Syne',sans-serif;font-weight:800;font-size:26px}
  .pred-lbl{font-size:10px;color:#4E5A6E;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px}
  .conf-bar{height:4px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:16px;overflow:hidden}
  .conf-fill{height:100%;background:linear-gradient(90deg,#1D6FE8,#06D6A0);border-radius:2px;transition:width .6s}
  .spin-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
  .spin-pill{padding:6px 14px;border-radius:20px;font-size:12px;font-family:'DM Mono',monospace;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:#1A2030;color:#8A95A8;transition:all .15s;font-weight:500}
  .spin-pill.active{border-color:rgba(29,111,232,0.5);background:rgba(29,111,232,0.15);color:#4F8EF7}
  .phase-pill{padding:6px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid rgba(255,255,255,0.1);background:#1A2030;color:#8A95A8;transition:all .15s}
  .phase-pill.active{border-color:rgba(6,214,160,0.5);background:rgba(6,214,160,0.1);color:#06D6A0}
  .section-gap{margin-bottom:20px}
  .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;color:#4E5A6E;text-align:center}
  .empty-icon{font-size:48px;margin-bottom:16px;opacity:0.4}
  .empty-text{font-size:14px;line-height:1.6;max-width:300px}
  .chart-container{height:240px;width:100%}
  .chart-container-sm{height:200px;width:100%}
  .tab-row{display:flex;gap:4px;background:#1A2030;padding:3px;border-radius:10px;margin-bottom:20px}
  .tab{flex:1;text-align:center;padding:8px;border-radius:8px;cursor:pointer;font-size:13px;color:#4E5A6E;transition:all .15s;font-weight:500}
  .tab.active{background:#1D6FE8;color:#fff}
  .loading{display:flex;align-items:center;justify-content:center;height:200px;color:#4E5A6E;font-size:14px;gap:8px}
  .dot-anim span{animation:blink 1.2s infinite;display:inline-block}
  .dot-anim span:nth-child(2){animation-delay:.2s}
  .dot-anim span:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  .spin-type-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px}
  .stg-card{background:#1A2030;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:12px;text-align:center}
  .stg-short{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;margin-bottom:4px}
  .stg-sr{font-size:12px;color:#8A95A8}
  .stg-bar{height:3px;border-radius:2px;margin-top:8px;min-width:10%}
  .scrollbar-hide::-webkit-scrollbar{display:none}
  .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
  select option{background:#1A2030}
  .ai-card{background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(29,111,232,0.05));border:1px solid rgba(139,92,246,0.25);border-radius:14px;padding:20px 22px}
  .ai-card-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:#A78BFA;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .ai-text{font-size:13.5px;color:#C5D0E6;line-height:1.8;font-family:'Inter',sans-serif}
  .ai-loading{display:flex;align-items:center;gap:8px;color:#8B5CF6;font-size:13px;font-family:'DM Mono',monospace}
  .cache-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:10px;margin-left:auto;text-transform:uppercase;letter-spacing:0.5px}
  .cache-badge.hit{background:rgba(6,214,160,0.1);color:#06D6A0;border:1px solid rgba(6,214,160,0.25)}
  .cache-badge.fresh{background:rgba(139,92,246,0.1);color:#A78BFA;border:1px solid rgba(139,92,246,0.25)}
`;

export default css;