/* ─────────────────────────────────────────────────────────────────
   Cohort — hero ambient layer: the globe.

   A dot-matrix Earth in slow rotation, low on the horizon behind
   the headline. Every few seconds a city lights up — a new
   connection — and sometimes a champagne thread arcs across the
   planet to someone lit before it. An introduction, across the
   world.

   Canvas 2D, zero dependencies, single rAF loop. Orthographic
   projection of pre-baked land points; back hemisphere culled;
   arcs occlude behind the limb. On mobile / coarse pointers /
   reduced motion it renders exactly one composed frame (Atlantic
   view, four cities lit, two arcs drawn) and stops — the CSS
   gradient behind it remains the no-JS fallback.

   Land data: Natural Earth 110m land via world-atlas@2, baked
   offline — regenerate with a topojson point-in-polygon sampler
   over a Fibonacci sphere (see repo history / bake script).
   ───────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── Mount + guards ──────────────────────────────────────────── */
  var host = document.querySelector('.hero-ambient');
  if (!host || typeof window.matchMedia !== 'function') return;

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Mobile now animates too — with tuned params (see MOBILE block below).
  // Static-frame fallback is reserved for reduced-motion only.
  var IS_MOBILE =
    matchMedia('(max-width: 820px)').matches ||
    !matchMedia('(pointer: fine)').matches;

  var ANIMATED = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── CONFIG — every tunable in one place ─────────────────────── */
  var CONFIG = {
    rotationSec: 48,          // seconds per full revolution
    tiltDeg: 20,              // base axial tilt toward viewer
    wobbleDeg: 2.5,           // extra tilt swing
    wobbleSec: 37,            // wobble period
    staticViewDeg: -35,       // static-mode centre longitude (Atlantic)

    centerYFrac: 0.70,        // globe centre, fraction of hero height
    radiusHFrac: 0.58,        // radius as fraction of hero height…
    radiusWFrac: 0.46,        // …clamped by fraction of hero width

    dotRadius: 1.05,          // land dot radius, CSS px (scales a little with R)
    dotAlphaBase: 0.10,       // land alpha = base + gain·depth
    dotAlphaGain: 0.42,

    pulseMin: 2.0,            // seconds between pulses (random in range)
    pulseMax: 3.4,
    pulseDur: 1.8,            // ring bloom duration

    arcChance: 0.85,          // odds a pulse also draws an introduction
    arcMax: 3,                // concurrent arcs
    arcGrow: 1.5,             // seconds: tip travels start → end
    arcHold: 1.1,             // seconds: full thread holds
    arcFade: 1.0,             // seconds: thread dissolves
    arcSamples: 64,

    yawMaxDeg: 5,             // mouse parallax
    pitchMaxDeg: 3.5,
    parallaxLerp: 0.05,

    fadeInSec: 1.4            // canvas opacity ease on boot
  };

  // MOBILE — trim the GPU/CPU budget without killing the vibe.
  // Slower spin, fewer land dots, fewer concurrent arcs. Pulse
  // cadence + arc timing are untouched — those are the mood.
  if (IS_MOBILE) {
    CONFIG.rotationSec = 60;
    CONFIG.arcMax = 2;
  }

  /* ── Palette (brand only) ────────────────────────────────────── */
  var CREAM = '250,250,247';       // #FAFAF7
  var CH = '201,166,107';          // champagne #C9A66B
  var LT = '228,200,143';          // light champagne #E4C88F

  var TAU = Math.PI * 2;
  var D2R = Math.PI / 180;

  /* ── Land dots — Natural Earth 110m via world-atlas@2, baked
        offline. 6 chars per point: base-36 (lat+90)·10, (lon+180)·10. */
  var LAND_DATA = '1c015t1bx0ws1bt12d1bq0tc1bm0yx1bk0pw1bi14h1bc1111ba0s11b916m1b81l71b70xl1b50ol1b41361b325d1b21hr1b00l51ay0zq1aw0qp1av15b1at0wa1as0n91aq11v1ao17f1am0yf1aj13z1ai1ik1af10j1ad0rj1ac1641aa0x31a90o31a812o1a61vu1a51881a40z81a114s1a127019z0mr19y11c19x23k19w2i519w1uj19v16x19v29419v0jb19u0xw19s0ow19s13h19r25o19o10119o22819m15m19m27t19j0nl19i12619i24d19g17q19g29x19f0yq19f20x19e0pp19d14a19d26h19c0gp19a0m919a10u1992311980ru19816f19728m1970it19412z1942561940fd1922ar1910zj19121q1900qi1901sq18z15418z27b18z0hi18x2cv18x0n218w11o18w23v18v2ig18v0sn18u17818u29f18u0jm18t0y818t20f18s1ct18s2f018s1re18r13s18r25z18q2kl18q1wz18p2bk18p2q518o10c18o22j18n2h518n0rc18n1tj18n15x18m28418m0ib18l1z318l2dp18k0nw18k12h18j24o18j2j918j0tg18i05u18i2a918h0kg18h0z118h21818g2ft18f14m18f26t18e2le18e1xs18e07z18d2cd18d0mk18d2qz18c11618c23d18c0dk18b2hy18b16q18a28x18a0j418a1lb1891zx1890a41890op1881qw18813a1880fo1871hv1870ua1871wh18606o18618v1860l91850zu1850c81851ef1840qu18403818415f1830ht1830we1821yl18208s1821az1820ne1811pl18111z1810ed1801gk1800sy18005c17z17j17z0jy17y0yj17y0ax17y1d417x0pi17x1rp17x01w17x14317w0gi17w0v317v07h17v19o17v0m217u10n17u0d217u1f917t0rn17t04117t16817s0im17s0x717r09m17r1bt17r0o717q12s17q0f617q1hd17p0ts17p06617p18d17o0kr17o0zc17n0bq17n1dx17n0qc17m02q17m14x17m0hb17l0vw17l1y317l08a17l1ah17k0mw17k11h17j0dv17j1g217j0sg17i04u17i17117i0jg17h0y117h0af17h1cm17g0p017g13l17f0g017f0ul17e06z17e19617e0lk17e1nr17d10517d0ck17d1er17c0r517c03j17c15q17c0i417b0wp17b09417a1bb17a0np17a00317a12a1790eo1791gv1790t917805o17817v1780k91770yu1770b81771df1760pt17602817614f1750gt1750ve17507s17419z1740md1741ol17410z1730dd1731fk1730ry17204c17216j1720ix1721l51712nc1711zq17109x1712eb1700oi1701qp17025a16z0fh16z1hp16z2jw16z0u316z1wa16z06h16y18o16y2av16y0l216y1n916y2pg16y0zn16x21u16x0c116x2gg16x0qn16x1su16w27f16w0hm16w1jt16w2m016v1ye16v08l16v2d016v0n716u1pe16u11s16u23z16u0e616t2ik16t1uy16s29k16s0jr16s1ly16s2o516s20j16r0aq16r2f416r1ri16q26416q0gb16q1ii16q2kp16q0uw16p1x316p07a16p2bo16p0lv16p1o216o2qa16o10h16o22o16o0cv16o2h916n0rg16n1tn16n28816n0if16m1km16m2mu16m1z816m09f16l2dt16l0o016l1q716l24s16k0ez16k1h616k2je16k1vs16k05z16j2ad16j0kk16j1mr16j2oy16j21c16i0bj16i2fy16i1sc16h26x16h0h416h2li16g1xw16g08316g2ci16g0mp16g1ow16f2r316f11a16f23h16f0do16f1fv16f2i216e1ug16e04n16e29216e0j916e1lg16d20116d0a816d2em16c1r016c25m16c0ft16b1i016b2k716b1wl16b06s16a2b616a0ld16a1nk16a2pr16a22616a0cd1692gr1691t516827q1680hx1681k41682mb1681yq16708x1672db1670ni1671pp16712316624a1660eh1661go1662iv1660t31661va16505h16529v1650k21651m91652og16420u1640b11642ff1641ru16326f1630gm1632l01621xe16207l1622bz1620m71621oe16110s16122z1610d61612hk1601ty16004516028j1600ir1601ky15z1zj15z09q15z2e415y1qi15y25315y0fb15y1hi15x2jp15x0tw15x1w315x06a15x2ao15x0kv15w1n215w2p915w21n15w0bv15v2g915v1sn15v27815v0hf15u1y715u08f15t2ct15t0n015t1p715t11l15t23s15t0dz15s1g615s2id15s0sk15s1ur15s04z15s29d15r0jk15r2ny15r20c15r0aj15q2ex15q1rc15q25x15p0g415p1ib15p2ki15p1ww15p07315o2bh15o0lo15o1nw15o22h15o0co15n2h215n1tg15m28115m0i815m1z115l2dm15l1q015l24l15k0es15k1h015k2j715k0te15k1vl15k05s15j2a615j0kd15j1mk15j21515j0bc15i2fr15i1s515i26q15h0gx15h1xp15h07w15g2cb15g0mi15g1op15g23a15g0dh15f1fo15f1u915e28v15e0j215e1l915e1zu15d2ef15d1qt15d25f15c0fm15c1ht15c0u715c1we15c06l15b2az15b0l615b1nd15b21z15b0c615a2gk15a1sy15a27j15a0hq1590wc1591yj1592d41580nb1581pi1582431580ea1570sw1571v315729o1570jv1561m215620n1562f91551rn1552681550gf1551im1540v01541x71542bt1540m01531o715322s1530cz1521tr15228d1520ik1522my1511zc1512dx1510o41511qb15024x1500f41501hb1500tp14z1vw14z2ah14z0ko14z1mv14y21h14y2g214y1sg14x27114x0h814x2lm14x0vt14x1y114w2cm14w0mt14w1p014v23l14v0ds14v1ul14u29614u0jd14u1lk14u20514t1cj14t2eq14t0oy14t1r514t25q14s0fx14s1i414s0ui14s1wp14s2ba14r0li14r1np14r22a14q1t914q27u14q0i214q1k914p2mg14p0wn14p1yu14p2df14p0nm14o1pt14o24e14o0em14o1gt14o0t714n1ve14n05l14n29z14n0k614n1md14m20y14m2fk14m1ry14l26j14l0gq14l0vb14l1xi14k2c414k0mb14k1oi14k23314j1u214i28o14i0iv14i1l214i1zn14h2e814h0of14h1qn14h25814h0ff14h1hm14g0u014g1w714g2as14g0kz14f1n714f21s14e1sr14e27c14e0hj14e2ly14e0w514d1yc14d2cx14d0n414d1pb14c23w14c0e314c0sp14c1uw14b29h14b0jo14b1lv14b20g14a1cv14a2f214a0p914a1rg14a2611490g81490ut1491x01492bm1480lt1481o014822l1471tk1472861470id1471kk1472mr1460wy1461z51462dq1460nx1461q414524q1450ex1450ti1451vp1442aa1440kh1441mo14421a1431do1432fv1430q21431s914326u1420h11421j81422lg1420vn1421xu1422cf1410mm1411ot14123e1400s71401ue14028z1400j61401ld13z0xr13z1zy13z2ek13z0or13z1qy13y25j13y0fq13y0ub13y1wi13x2b413x0lb13x1ni13x22313w2go13w0qv13w1t213w27o13w0hv13v1k213v2m913v0wg13v1yn13v2d813v0nf13u1pm13u24813u0ef13u1gm13u0t013t1v713t29s13t0jz13t1m613s20s13s1d613s2fd13s0pk13s1rr13r26c13r0gj13r1iq13r0v413r1xc13r2bx13q0m413q1ob13q22w13q1fa13q2hh13p1tw13p28h13p0io13p1kv13o0x913o1zg13o1bu13o2e113o0o913o1qg13n25113n0f813n1hf13n0tt13n1w013m2al13m0kt13m1n013m21l13l1dz13l2g613l0qd13l1sk13l27513l0hd13l1jk13k2lr13k0vy13k1y513k2cq13k0mx13k1p413j23p13j1g413j0si13j1up13i29a13i0jh13i1lo13i0y213i20913h2ev13h0p213h1r913h25u13h0g113g1i813g0um13g1wt13g2bf13g0lm13f1nt13f22e13f2gz13f0r613e1td13e27z13e0i613e1kd13e0wr13e1yy13d2dj13d0nq13d1py13d24j13c0eq13c1gx13c0tb13c1vi13c2a313c0ka13b1mi13b21313b1dh13b2fo13b0pv13a1s213a26n13a0gu13a1j213a0vg1391xn1392c81390mf1391om1392371381fm1382ht1380s01381u713828s1370iz1371l61370xk1371zr1372ed1370ok1361qr13625c1360fj1361hq1360u41351wb1352ax1350l41351nb13521w1342gh1340qo1341sv13427h1330ho1331jv1330w91331yg1332d11330n81321pf1322411321gf1320st1321v013129l1310js1311lz13120l1301cz1302f61300pd1301rk1302651300gc12z1ij12z0uy12z1x512z2bq12z0lx12y1o412y22p12y1f312y0ri12y1tp12x28a12x0ih12x1ko12x1z912w2dv12w0o212w1q912w24u12w0f112w1h812v0tm12v1vt12v2af12v0km12v1mt12u21e12u2fz12u0q612u1sd12t26z12t0h612t1jd12t1xy12s2cj12s0mq12s1ox12s23j12s1fx12r0sb12r1ui12r29312r0ja12r1lh12q0xv12q20312q2eo12q0ov12q1r212p25n12p0fu12p1i112p0uf12p1wn12p2b812o0lf12o1nm12o22712o1el12o2gs12o0r012n1t712n27s12n0hz12n1k612n1yr12m2dc12m0nk12m1pr12m24c12l1gq12l0t412l1vb12l29w12l0k412k1mb12k0yp12k20w12k1da12k2fh12k0po12k1rv12j26g12j0go12j1iv12j0v912j1xg12i2c112i0m812i1of12i23012i1ff12h2hm12h0rt12h1u012h28l12h0is12h1kz12g1zk12g2e612g0od12g1qk12f25512f1hj12f0tx12f1w412f2aq12e0kx12e1n412e21p12e1e312e2ga12e0qh12d1so12d27a12d0hh12d1jo12d1y912c2cu12c0n112c1p912c23u12b1g812b0sm12b1ut12b29e12b0jl12b1lt12a0y712a20e12a2ez12a0p612a1rd12925y1290g51291id1290ur1291wy1282bj1280lq1281nx12822i1281ex1280rb1271ti1272831270ia1271kh1271z21262do1260nv1261q212624n1251h11250tf1251vm1252a81250kf1251mm1240z01242171241dl1242fs1240pz1241s612326s1230gz1231j61230vk1231xr1222cc1220mj12223c1221fq1220s41211ub12128w1210j31211la1211zw1202eh1200oo1201qv12025g1200fn11z1hu11z0u911z1wg11z2b111z0l811z1nf11y22011y1ee11y0qt11y1t011x27l11x0hs11x1jz11x0wd11x1yk11x2d611w0nd11w1pk11w24511w1gj11w0sx11v1v411v29q11v0jx11v1m411v20p11u2fa11u0ph11u26a11u0gh11u1io11t0v211t1x911t2bu11t0m111s22u11s1f811s0rm11s1tt11s28e11r0il11r1ks11r0x611r1ze11r2dz11r0o611q1qd11q24y11q1hc11q0tq11q1vy11p2aj11p0kq11p21i11p1dw11o2g311o0qb11o27311o0ha11o1jh11o0vv11n1y211n2cn11n0mv11n1p211n23n11m1g111m0sf11m1um11m29711m0jf11m1lm11l20711l2es11l0oz11k25r11k0fz11k1i611k0uk11k1wr11k2bc11j0lj11j1nq11j22b11j1eq11j0r411i1tb11i27w11i0i311i1ka11i0wo11i1yv11h2dh11h0no11h1pv11h24g11h1gu11g0t811g1vf11g2a111g0k811f21011f2fl11f0ps11f26l11f0gs11e1iz11e1xk11e2c511e0mc11e1ok11d23511d1fj11d2hq11d0rx11d1u411c28p11c0iw11c1l411c1zp11c2ea11b0oh11b1qo11b25911b0u211b1w911a2au11a0l111a21t11a1e81190qm1191st11927e1190hl1191js1181yd1182cz1180n61181pd11823y1170sq1171ux11729j1170jq1171lx11620i1162f31160pa1152631150ga1151ih1151x21152bn1150lu11422n1141f11140rf1141tm1132871130ie1131kl1131z71122ds1120nz1121q611224r1121h51120tk1111vr1112ac1110kj11121b1101dp1100q41101sb11026w1100h31101ja10z1xv10z2ch10z0mo10z23g10y2i110y0s810y1uf10y29110y0j810x1lf10x20010x1ce10x0os10x1qz10w25l10w0fs10w1wk10w2b510v0lc10v22510v1ej10v0qx10v1t410u27p10u0hw10u1k310u1yp10t2da10t0nh10t1po10t24910t0t110s1v910s29u10s0k110s20t10r1d710r0pm10r26e10r0gl10q1xd10q2by10q0m610q22y10p0rq10p1tx10p28i10p0iq10p1kx10o1zi10o1bw10o2e310o0oa10o1qh10n25210n1hh10n0tv10n1w210n2an10n0ku10m21m10m1e110m0qf10m1sm10l27710l0he10l1jl10l1y610l2cs10l0mz10k23r10k0sj10k1uq10j29c10j0jj10j1lq10j20b10j1cp10i0p310i1ra10i25w10i0g310i1ia10i1wv10h2bg10h0ln10h1nv10h22g10g0r810g1tf10g28010g0i710g1kf10f1z010f2dl10f0ns10f1pz10f24k10e0td10e1vk10e2a510e0kc10e1mj10d21410d1dj10d0px10d26p10d0gw10c1xo10c2ca10c0mh10c1oo10b23910b0s110b1u810b28u10a0j110a1zt10a1c710a0ol10a1qs10925e1090fl1091wd1092ay1080l51081nc10821y1080qq1081sx10727i1070hp1071jw1071yi1072d31060na1061ph1062421061gg1060sv1061v210529n1050ju1051m110520m1051d01040pf1041rm1042671040ge1041il1041x61030lz1031o610322r1022hc1020rj1021tq10228c1020ij1011zb1011bp1010o31011qa10124w1001vv1002ag1000kn1001mu0zz21g0zz1du0zz0q80zz2700zz0h70zy1y00zy0ms0zy1oz0zx23k0zx0sc0zx1uk0zx2950zx0jc0zx1lj0zw2040zw1ci0zw0ox0zw1r40zv25p0zv0fw0zv1wo0zv0lh0zv1no0zu2290zu0r10zu1t80zt27t0zt0i10zt1k80zt1yt0zt2de0zt0nl0zt1ps0zs24d0zs1vd0zr29y0zr0k50zr1mc0zr20x0zr1dc0zr0pq0zq26i0zq0gp0zq1xh0zp0ma0zp1oh0zp2320zp0ru0zp1u10zo28n0zo0iu0zo1zm0zo1c00zn0oe0zn1ql0zn2570zn1w60zm0ky0zm1n60zm21r0zl0qj0zl27b0zl0hi0zl1yb0zk2cw0zk0n30zk1pa0zk23v0zj0so0zj1uv0zj29g0zj0jn0zj1lu0zj20f0zi1cu0zi0p80zi1rf0zi2600zi0g70zh1wz0zh2bl0zh0ls0zh1nz0zh22k0zg2h50zg0rc0zg1tj0zg2850zg0ic0zf1z40zf2dp0zf0nw0zf1q30zf24p0ze1vo0ze2a90ze0kg0ze1mn0zd2190zd0q10zd26t0zd0h00zc1xt0zc0ml0zc1os0zc23d0zb0s60zb1ud0zb28y0zb0j50za1zx0za1cb0za0oq0za1qx0za25i0z91wh0z92b30z90la0z91nh0z82220z82gn0z80qu0z81t10z827n0z80hu0z71ym0z72d70z70ne0z71pl0z62470z61gl0z61v60z629r0z60jy0z61m50z520r0z50pj0z51rq0z526b0z40gi0z41xb0z40m30z41oa0z322v0z31f90z30rn0z31tv0z328g0z20in0z21zf0z20o80z21qf0z12500z11vz0z12ak0z10ks0z021k0z02g50z00qc0z01sj0yz2740yz0hc0yz1y40yz0mw0yz1p30yy23o0yy1g30yy0sh0yy1uo0yy2990yx0jg0yx2080yx0p10yx1r80yw25t0yw1ws0yw0ll0yv22d0yv1er0yv2gy0yv0r50yv1tc0yu27y0yu0i50yu1yx0yu2di0yu0np0yu1pw0yt24i0yt1gw0yt1vh0yt2a20ys0k90ys2120ys1dg0ys2fn0ys0pu0ys1s10yr26m0yr0gt0yr1xm0yr0me0yq1ol0yq2360yq1fl0yq0rz0yq1u60yp28r0yp0iy0yp1zq0yp0oj0yp1qq0yo25b0yo1wa0yo2aw0yo0l30yn1na0yn21v0yn1e90yn2gg0yn0qn0yn1su0ym27g0ym0hn0ym1yf0ym0n70ym1pe0yl2400yl1ge0yl1uz0yl29k0yk0jr0yk20k0yk1cy0yk0pc0yk1rj0yj2640yj1x40yj0lw0yi1o30yi22o0yi1f20yi0rh0yi1to0yh2890yh0ig0yh1z80yh0o10yh1q80yg24t0yg1vs0yg2ae0yg0kl0yf21d0yf1dr0yf0q50yf1sc0ye26y0ye0h50ye1xx0ye0mp0ye1ow0yd23i0yd1fw0yd1uh0yd2920yd0j90yc2020yc1cg0yc0ou0yc1r10yb25m0yb1wm0yb2b70yb0le0ya2260ya1ek0ya0qy0ya1t60ya27r0y90hy0y91yq0y90nj0y91pq0y824b0y81gp0y81va0y829v0y80k30y720v0y71d90y70pn0y71ru0y726f0y61xf0y60m70y61oe0y522z0y51fe0y50rs0y51tz0y528k0y50ir0y41zj0y41by0y42e50y40oc0y41qj0y42540y31hi0y31w30y32ap0y30kw0y221o0y21e20y20qg0y21sn0y22790y11y80y10n00y11p70y123t0y01g70y01us0y029d0y00jk0xz20d0xz1cr0xz0p50xz1rc0xz25x0xy1wx0xy2bi0xy0lp0xy1nw0xy22h0xx1ew0xx0ra0xx1th0xx2820xx0i90xx1kg0xw1z10xw1bg0xw0nu0xw1q10xw24m0xw1h00xv1vl0xv2a70xv0ke0xv2160xu1dk0xu0py0xu1s50xu26r0xu1xq0xt0mi0xt1op0xt23b0xt1fp0xs1ua0xs28v0xs0j20xs1zv0xs1c90xr2eg0xr0on0xr1qu0xr25f0xr1ht0xr1wf0xq2b00xq0l70xq21z0xq1ed0xq0qs0xp1sz0xp27k0xp0hr0xp1jy0xp1yj0xo0nc0xo1pj0xo2440xo1gi0xo1v30xn29p0xn0jw0xn20o0xn1d20xn0pg0xn1rn0xm2690xm1in0xm1x80xm2bt0xl0m00xl1o70xl22t0xl1f70xl1ts0xk28d0xk1kr0xk1zd0xk1br0xk0o50xk1qc0xj24x0xj1hb0xj1vx0xj2ai0xj0kp0xi1mw0xi21h0xi1dv0xi0q90xi1sh0xi2720xh1jg0xh1y10xh0mu0xh1p10xg23m0xg1g00xg1ul0xg2960xg0je0xg1ll0xf2060xf1ck0xf0oy0xf1r50xf25q0xe1i50xe1wq0xe2bb0xe0li0xe1np0xd22a0xd1ep0xd0r30xd1ta0xd27v0xd0i20xd1k90xc1yu0xc0nn0xc1pu0xc24f0xc1gt0xb1ve0xb2a00xb0k70xb1me0xb20z0xa1dd0xa26k0xa1iy0x91xj0x90mb0x91oi0x92340x91fi0x81u30x828o0x80iv0x81l30x81zo0x81c20x71qn0x72580x71hn0x71w80x62at0x60l00x61n70x621s0x61e70x51ss0x527d0x51jr0x51yc0x40n50x41pc0x423x0x41gb0x41uw0x329i0x30jp0x31lw0x320h0x31cv0x22620x21ig0x21x10x22bm0x20lt0x21o00x122m0x11f00x10re0x11tl0x12860x00id0x01kk0x01z60x01bk0x01q50wz24q0wz1h40wz1vq0wz2ab0wz0ki0wz1mp0wy21a0wy1do0wy1sa0wy26v0wy1j90wx1xu0wx0mn0wx1ou0wx23f0ww1ft0ww1ue0ww2900ww0j70ww1le0ww1zz0wv1cd0wv1qy0wv25k0wv1hy0wu1wj0wu2b40wu0lb0wu1ni0wu2240wu1ei0wt1t30wt27o0wt1k20wt1yo0wt1b20ws1pn0ws2480ws1gm0ws1v80wr29t0wr0k00wr1m70wr20s0wr1d60wq26d0wq1ir0wq1xc0wp0m50wp1oc0wp22x0wp1fb0wp1tw0wo28h0wo0ip0wo1kw0wo1zh0wo1bv0wo1qg0wn2510wn1hg0wn1w10wn2am0wn0kt0wn1n00wm21l0wm1e00wm2760wl1jk0wl1y50wl1ak0wl0my0wl1p50wl23q0wk1g40wk1up0wk29b0wk0ji0wk1lp0wk20a0wj1co0wj1r90wj25v0wj1i90wi1wu0wi2bf0wi0lm0wi22f0wi1et0wh0r70wh1te0wh27z0wh1ke0wh1yz0wh1bd0wg1py0wg24j0wg1gy0wg1vj0wf2a40wf0kb0wf1mi0wf2130wf1di0we26o0we1j20we1xn0we0mg0wd1on0wd2380wd1fm0wd1u70wd28t0wc0j00wc1l70wc1zs0wc1c60wc1qr0wb25d0wb1hr0wb1wc0wb2ax0wb0l40wb1nb0wa21x0wa1eb0wa27h0wa1jv0w91yh0w91av0w91pg0w92410w91gf0w81v10w829m0w80jt0w81m00w820l0w71cz0w71rl0w72660w71ik0w71x50w60ly0w622q0w61f40w60ri0w528b0w51kp0w51za0w51bo0w41q90w424v0w41h90w41vu0w32af0w30km0w31mt0w321f0w31dt0w226z0w21jd0w21xz0w21ad0w20mr0w21oy0w123j0w11fx0w12940w11li0w02030w01ch0w01r30w025o0vz1i20vz1wn0vz0lg0vz1nn0vz2280vy1em0vy27s0vy1k70vy1ys0vx1b60vx1pr0vx24c0vx1gr0vw29x0vw0k40vw1mb0vw20w0vw1db0vv1rw0vv26h0vv1iv0vv1xg0vv19v0vu0m90vu1og0vu2310vu1ff0vt28m0vt1l00vt1zl0vt1bz0vt1qk0vs2560vs1hk0vs2aq0vs0kx0vs1n40vr21q0vr1e40vr27a0vr1jp0vq1ya0vq1ao0vq1p90vq23u0vp1g90vp29f0vp1lt0vp20e0vo1ct0vo1re0vo25z0vo1id0vo1wy0vn2bk0vn0lr0vn22j0vn1ex0vm1ti0vm2840vm1ki0vm1z30vm1bh0vl1q20vl24o0vl1h20vl2a80vk0kf0vk1mm0vk2180vk1dm0vk1s70vj26s0vj1j60vj1xs0vj1a60vj0mk0vj1or0vi23c0vi1fq0vi1uc0vi28x0vi1lb0vh1zw0vh1ca0vh1qw0vh25h0vh1hv0vg0l90vg1ng0vg2210vg1ef0vf1t00vf27m0vf1k00vf1yl0vf1az0ve1pk0ve2460ve1gk0vd29q0vd1m40vd20q0vd1d40vd1rp0vc26a0vc1io0vc19o0vc0m20vb22u0vb1f80vb0rm0vb1tu0vb28f0va1kt0va1ze0va1bs0va1qe0va24z0v91hd0v90kr0v91my0v921j0v81dx0v81si0v82730v81ji0v81y30v71ah0v71p20v723n0v71g20v62980v61lm0v62070v61cm0v51r70v525s0v51i60v50lk0v41nr0v422c0v41eq0v41tb0v427x0v31kb0v31yw0v31ba0v31pv0v324h0v21gv0v21mf0v12110v11df0v11s00v126l0v11j00v01xl0v019z0v00md0v01fk0uz1u50uz28q0uz1l40uz1zp0uz1c40uy1qp0uy25a0uy1ho0ux0l20ux1n90ux21u0ux1e80ux1st0uw27f0uw1jt0uw1ye0uw1as0uw1pd0uv23z0uv1gd0uv0sr0uv1lx0uu20j0uu1cx0uu0pb0uu1ri0uu2630uu1ih0ut19h0ut0lv0ut1o20ut1f10us1tn0us1km0us1z70us1bl0ur1q70ur24s0ur1h60uq1mr0uq21c0uq1dq0uq1sb0up26x0up1jb0up1aa0up0mo0uo1fv0uo1lf0un2010un1cf0un1r00un25l0un1hz0um0ld0um1nk0um1ej0ul1t50ul1k40ul1yp0ul1b30uk1pp0uk24a0uk1go0uk0t20uj1m90uj20u0uj1d80uj0pm0uj1rt0ui26e0ui1it0ui19s0ui0m60uh1fd0uh1ty0uh28j0uh1kx0ug1zi0ug1bx0ug1qi0ug2530ug1hh0uf0tv0uf0kv0uf1n20uf1e10ue1sm0ue2780ue1jm0ue1al0ud0mz0ud1g60uc1lq0uc20c0uc1cq0uc0p40uc1rb0ub25w0ub1ib0ub0up0ub0lo0ub1nv0ua1ev0ua1tg0ua1kf0u91z00u91bf0u91q00u924l0u91gz0u81mk0u82150u81dj0u71s40u726q0u71j40u71a30u60mh0u61fo0u51l80u51zu0u51c80u50om0u51qt0u425e0u41hs0u40u70u41nd0u31ec0u31sy0u31jx0u21yi0u21aw0u20nb0u21gh0u11m20u120n0u11d10u10pf0u01rm0u02680u01im0u019l0u02bs0u00lz0tz1o60tz1f60ty1kq0ty1zc0ty1bq0ty0o40ty1qb0ty24w0tx1ha0tx1mv0tw1du0tw1sg0tw2710tw1jf0tv1ae0tv0mt0tv1fz0tu1lk0tu2050tu1cj0tu0ox0tu1r40tt25p0tt1i40tt1no0ts1eo0ts1t90ts1k80tr1yt0tr1b80tr0nm0tr1pt0tr24e0tr1gs0tq1md0tq1dc0tp1rx0tp26j0tp1ix0tp19w0to0ma0to1oh0to1fh0tn1l10tn1zn0tn1c10tn0of0tn1qm0tm2570tm1hm0tm1n60tl1e60tl27c0tl1jq0tk1aq0tk0n40tk1ga0tj1lv0tj20g0tj1cu0ti0p80ti1rf0ti2610ti1if0ti2bl0th1nz0th1ez0tg1kj0tg1z50tg1bj0tg0nx0tg1q40tf1h30tf1mo0te1dn0te0q20te1s90te26u0te1j80td1a70td1ot0td1fs0tc1ld0tc1zy0tc1cc0tc0oq0tc1qx0tb25j0tb1hx0tb1nh0ta1eh0ta27n0ta1k10t91yn0t91b10t91gl0t81m60t81d50t70pj0t71rr0t726c0t71iq0t719p0t61ob0t61fa0t51kv0t51zg0t51bu0t51qf0t41hf0t41mz0t31dz0t30qd0t32750t31jj0t21aj0t21p40t21g30t11lo0t12090t11cn0t10p10t11r80t025u0t01i80t01ns0sz1es0sz27y0sz1kc0sy1yy0sy1bc0sy1gx0sx1mh0sx1dh0sw0pv0sw26n0sw1j10sw1a10sw2c80sv1om0sv1fl0su1l60su1zr0su1c50su1qq0su25c0st1hq0st1na0ss1ea0ss0qo0ss27g0ss1ju0sr1au0sr1pf0sr1ge0sq1lz0sq1cy0sq0pd0sp2650sp1ij0sp19i0sp1o40so1f30so28a0so1ko0sn1z90sn1bn0sn1q80sn1h80sm1ms0sm1ds0sl0q60sl26y0sl1jc0sl1ac0sk1ox0sk1fw0sj1lh0sj2020sj1cg0sj25n0si1i10si1nm0sh1el0sh27r0sh1k60sg1b50sg1pq0sg1gq0sf1ma0sf1da0se1iu0se19u0se1of0sd1fe0sd1kz0sc1zk0sc1by0sc1hj0sb1n30sb1e30sb0qh0sa2790sa1jn0sa1an0sa2cu0sa1p80s91g80s91ls0s81cs0s81ic0s71nx0s71ew0s62830s61kh0s61z20s61bg0s51q10s51h10s50tf0s41ml0s41dl0s41s60s426r0s31j50s31a50s31oq0s21fp0s21la0s21zv0s11c90s125g0s11hu0s10u80s01nf0s01ee0s00qs0rz27l0rz1jz0rz1ay0rz1pj0ry1gj0ry1m30rx1d30rx1ro0rx1in0rx0v10rw1o80rw1f70rv1ks0rv1zd0rv1br0rv1qd0ru1hc0ru0tq0ru1mx0rt1dw0rt0qa0rt1jh0rs0vv0rs1ag0rs1p10rs1g10rr1ll0rr1cl0rq1r60rq1i50rq0uj0rp1nq0rp1ep0ro1ka0ro0wo0ro1b90ro1pu0rn1gu0rn0t80rn1me0rn1de0rm1rz0rm1iy0rm0vd0rl2c50rl1oj0rl1fj0rl0rx0rk1l30rk1zo0rk1c30rk1qo0rj1hn0rj0u10rj2au0rj1n80ri1e70ri1js0ri0w60rh1ar0rh2cy0rh1pc0rh1gc0rg1lw0rg20i0rg1cw0rg1rh0rf1ig0rf0uv0rf1o10re1f00re0rf0re1kl0re0wz0rd1bk0rd1q60rd1h50rd0tj0rc1mq0rc1dp0rb1ja0rb0vo0rb2cg0rb1ou0ra1fu0ra1le0r91ce0r91qz0r925k0r91hy0r80uc0r81nj0r81ei0r71k30r70wh0r71b20r61po0r61gn0r60t10r51m80r51d70r51rs0r41is0r40v60r42by0r41oc0r41fc0r30rq0r31kw0r30xa0r31bw0r21qh0r21hg0r20tu0r11n10r11e00r01jl0r00vz0r02cr0r01p50qz1g50qz0sj0qz1lp0qz20b0qy1cp0qy1ra0qy25v0qy1i90qy0uo0qx1nu0qx1eu0qw1ke0qw0ws0qw1be0qw1pz0qv1gy0qv0tc0qv1mj0qu1di0qu1j30qu0vh0qt1on0qt1fn0qs1l70qs0xm0qs1c70qs1qs0qr1hr0qr0u60qr1nc0qq1eb0qq1jw0qq0wa0qp1ph0qp1gg0qp0su0qo1m10qo1d00qo1rl0qn2670qn1il0qn0uz0qn1o50qm1kp0ql0x30ql1bp0ql1qa0ql1h90qk0tn0qk2ag0qk1mu0qk1dt0qj1je0qj0vs0qi1oz0qi1fy0qh1lj0qh0xx0qh1ci0qh1r30qh1i30qg0uh0qg1nn0qf1k70qf0wl0qe1ps0qe1gr0qe0t50qe29y0qd1mc0qd0yq0qd1db0qd26i0qc1iw0qc0va0qc1og0qb1l00qb0xf0qb1c00qa1ql0qa2560qa1hk0qa0tz0q92ar0q91n50q90zj0q81jp0q80w30q81pa0q70sn0q71lu0q70y80q62600q61ie0q60us0q51ny0q41ki0q40wx0q41q30q31h20q30th0q32a90q31mn0q30z10q21j70q20vl0q11os0q01lc0q00xq0q01qw0pz25i0pz1hw0pz0ua0pz1ng0py1k00py0we0px1pl0px0sy0pw29r0pw1m50pw0yj0pv26b0pv1ip0pv0v30pv1oa0pu1ku0pt0x80pt1qe0pt1he0pt0ts0ps2ak0ps1my0ps0zc0pr1ji0pr0vw0pr1p30pq0sg0pq2990pq1ln0pp0y10pp25t0pp1i70po0ul0po1nr0pn1kb0pn0wq0pm1pw0pm1gv0pm0ta0pm2a20pl1mg0pl0yu0pl26m0pl1j00pk0ve0pk1ol0pj1l50pj0xj0pi1hp0pi0u30ph1n90ph0zo0pg1jt0pg0w80pg1pe0pf0ss0pf29k0pf1ly0pf0yc0pe2640pe1ii0pe0uw0pd1o30pc1kn0pc0x10pc1q70pb1h70pb0tl0pb2ad0pb1mr0pb0z50pa1jb0pa0vp0p92ci0p91ow0p90s90p82920p81lg0p80xu0p825m0p71i00p70ue0p71nl0p70zz0p61k50p60wj0p51pp0p51gp0p50t30p429v0p41m90p40yn0p326f0p31it0p30v70p31oe0p20rr0p228k0p21ky0p20xc0p11hi0p10tw0p01n20p00zh0oz1jm0oz0w10oz1p70oy0sl0oy29d0oy1lr0oy0y50ox25x0ox1ib0ox0up0ow1nw0ow10a0ov1kg0ov0wu0ou1h00ou0te0ou2a60ou1mk0ot0yz0ot26q0ot1j40os0vj0os1op0os0s30or28v0or1l90or0xn0or2ef0oq1ht0oq0u70oq1ne0op0zs0op1jy0oo0wc0oo1pi0oo1gi0on0sw0on29o0on1m20on0yg0on2f90om2680om1im0om0v00om2bt0ol1o70ol10l0ol0rk0ol1kr0ok0x50ok1hb0oj0tp0oj1mw0oj0za0oi1jg0oi0vu0oh1p00oh11e0oh0se0oh2960og1lk0og0xy0og2er0of1i40of0ui0of2bb0of1np0of1030oe1k90oe0wn0od1gt0od0t70od29z0oc1md0oc0ys0oc26j0ob1ix0ob0vc0ob1oi0ob10w0oa0rw0oa28o0oa1l20oa0xg0o91hm0o90u00o81n70o80zl0o82gd0o727d0o71jr0o70w50o711q0o60sp0o629h0o61lv0o60ya0o52f20o51if0o50uu0o42bm0o41o00o410e0o42h60o31kk0o30wy0o32dq0o312j0o21h40o20ti0o22ab0o21mp0o20z30o12fv0o126v0o11j90o10vn0o01ot0o01170o00s70nz1ld0nz0xr0ny1hx0ny0ub0ny1ni0nx0zw0nx2go0nx1k20nx0wg0nw1210nw0t00nv1m70nv0yl0nu1ir0nu0v50nu2bx0nu1ob0nt10p0nt2hi0nt0rp0nt1kv0ns0x90ns12u0ns1hf0nr0tt0nr1n00nr0ze0nr2g60nq2760nq1jk0nq0vy0np11j0np2ib0np0si0np1lo0no0y30no13n0no1i80nn0un0nn2bf0nn1nt0nn1070nn2h00nm1kd0nm0wr0nl12c0nl0tb0nk1mi0nk0yw0nj1j20nj0vg0nj1om0nj1110ni2ht0ni0s00ni1l60ni0xl0nh1350nh1hq0nh2jx0nh0u50ng1nb0ng0zp0ng2gh0nf1jv0nf0w90nf11u0ne2im0ne0st0ne1m00ne0ye0nd13y0nd1ik0nd0uy0nc1o40nc10i0nc2hb0nc0ri0nb1ko0nb0x20nb12n0na0tm0na1mt0na0z70n91jd0n90vr0n811c0n82i40n80sb0n71li0n70xw0n613g0n61i20n60ug0n61nm0n51000n52gt0n527s0n51k60n50wk0n41250n40t40n31mb0n30yp0n214a0n21iv0n20v90n21of0n110u0n12hm0n128l0n11kz0n00xe0n012y0mz0ty0mz1n40mz0zi0my1jo0my0w20mx11n0mx2if0mx0sm0mw1lt0mw0y70mw13s0mw1id0mv0ur0mv1nx0mv10c0mu2h40mu1kh0mu0ww0mt12g0mt0tg0ms1mm0ms0z00mr1j60mr0vk0mr1or0mr1150mq0s40mq28x0mq1lb0mq0xp0mp1390mp1hv0mp0u90mo2b10mo1nf0mo0zt0mn1jz0mn0wd0mn2d60mn11y0mm2iq0mm0sx0mm1m40mm0yi0ml1430ml1io0ml0v20mk2bu0mk1o90mk10n0mk2hf0mj1kt0mj0x70mi12r0mi0tr0mi2aj0mi1mx0mh0zb0mh1jh0mg0vv0mg2co0mg11g0mg0sf0mf1lm0mf0y00me13l0me1i60me0uk0md1nq0md1050md1ka0mc2mi0mc0wp0mc1290mb2j20mb0t90mb1mf0mb0yt0ma1iz0ma0vd0m91ok0m910y0m81l40m80xi0m81330m70u20m71n80m70zn0m61js0m60w70m511r0m50sr0m41lx0m40yb0m31ih0m30uv0m31o20m310g0m21km0m20x00m112k0m10tk0m01mq0m00z40lz1ja0lz0vo0lz1ov0ly1190ly1lf0lx0xt0lx13e0lx1hz0lw0ud0lw1nk0lw0zy0lv1k40lv0wi0lu1220lu0t20lt1m80lt0ym0ls1is0ls0v60ls1od0ls10r0lr2hj0lr1kx0lr0xb0lq12w0lq0tv0lp1n10lp0zg0lo1jl0lo0w00lo1p60lo11k0ln1lq0ln0y40lm2ex0lm1ia0lm0uo0ll1nv0ll1090lk1kf0lk0wt0lj12e0lj0td0lj1mj0li0yy0li2fq0li1j30lh0vi0lh1oo0lh1120lg2hu0lg1l80lg0xm0lg2ee0lf1370lf1hs0lf0u60le1nd0le0zr0ld1jx0ld0wb0ld11v0lc0sv0lc1m10lc0yf0lb2f80lb1rm0lb1il0lb0uz0la1o60la10k0la2hc0l91kq0l90x40l812p0l80to0l81mv0l70z90l71jf0l60vt0l61oz0l611d0l51lj0l50xx0l52eq0l41i30l40uh0l31no0l31020l21k80l20wm0l22de0l21270l10t60l11mc0l10yr0l02fj0l01rx0l01iw0l00vb0kz1oh0kz10v0kz2ho0ky1l10ky0xf0ky2e80kx1300kx1hl0kx0tz0kx1n60kw0zk0kw1jq0kv0w40kv2cw0kv1pa0kv11p0ku1lu0ku0y90ku2f10kt1rf0kt1ie0kt0ut0ks1nz0ks10d0kr1kj0kr0wx0kr2dp0kr12i0kq0th0kq1mo0kq0z20kp1j80kp0vm0ko1os0ko1160ko2hz0kn1lc0kn0xq0kn2ej0kn1qx0km1hw0km0ua0km1nh0kl0zv0kl1k10kk0wf0kk2d70kk1200kj1m60kj0yk0kj0ay0kj2fc0ki0pj0ki1rq0ki01x0ki0gi0ki1iq0ki0v40ki07i0ki19p0kh0m30kh1oa0kh10o0kh0d30kh1fa0kh2hh0kh0ro0kh1tv0kh0420kh1690kh28g0kg0in0kg1ku0kg2n10kg0x80kg1zf0kg09n0kg1bu0kg2e10kg0o80kg1qf0kg00m0kg12t0kg2500kf0f70kf1he0kf2jl0kf0ts0kf1vz0kf0670kf18e0kf2al0kf0ks0kf1mz0kf2p60kf0zd0kf21k0ke0br0ke1dy0ke2g50ke0qc0ke1sj0ke14y0ke2750ke1jj0ke2lq0ke0vx0ke1y40kd1ai0kd2cp0kd1p30kd2rb0kd11i0kd23p0kd2ia0kc1ln0kc0y20kc2eu0kb1r80kb1i70kb0um0ka1ns0ka1060k91kc0k90wq0k92dj0k912b0k81mh0k80yv0k72fn0k71j10k70vf0k62c70k61100k62hs0k51l50k50xk0k52ec0k51qq0k41hp0k41na0k30zo0k32gg0k31ju0k20w80k22d00k22rm0k211t0k22il0k11lz0k10yd0k02f50k01rj0k01ij0k00ux0jz1o30jz10h0jz2ha0jy1kn0jy0x10jy2du0jy12m0jx1ms0jx0z60jw2fy0jw1jc0jw0vq0jv2ci0jv11b0jv2i30ju1lh0ju0xv0ju2en0jt1r10jt1i10js1nl0js0zz0js2gs0jr1k50jr0wj0jr2dc0jr1240jq1ma0jq0yo0jp2fg0jp1iu0jp0v80jo2c00jo10t0jo2hl0jn1ky0jn0xd0jn2e50jm1qj0jm12x0jl1n30jl0zh0jl2ga0jk1jn0jk0w10jk2cu0jk11m0jj2ie0jj1ls0jj0y60ji2ey0ji1rc0ji1ic0ji0uq0jh2bi0jh10b0jh2h30jg1kg0jg0wv0jg2dn0jf12f0jf2j70je1ml0je0yz0je2fr0jd1j50jd0vj0jd2cb0jd1140jc2hw0jc1la0jc0xo0jb2eg0jb1qu0jb1hu0ja2b00ja1ne0ja0zs0ja2gl0j91jy0j90wc0j92d50j811x0j82ip0j71m30j70yh0j72f90j61in0j60v10j62bt0j610m0j52he0j51ks0j50x60j42dy0j41qc0j32ai0j31mw0j30za0j32g30j21jg0j20vu0j22cn0j111f0j12i70j01ll0j00xz0j02er0j01r50iz1i50iz0uj0iz2bb0iz1np0iz1040iy2gw0iy1k90ix0wo0ix2dg0ix1280ix2j10iw2a00iw1me0iw0ys0iv2fl0iv1iy0iv0vc0iu2c50iu10x0iu2hp0it1l30it0xh0it2e90it1qn0is2at0is1n70ir0zm0ir2ge0ir1jr0iq0w60iq2cy0iq11q0ip2ii0ip1lw0ip0ya0io2f20io1ig0io0uu0in2bm0in10f0in2h70im1kl0im0wz0im2dr0il1q50il2jc0il2ab0ik1mp0ik0z30ik2fw0ij1j90ij0vn0ij2cg0ij1180ii2i00ii1le0ii0xs0ih2ek0ih1qz0ig2b40ig1nj0ig0zx0ig2gp0if1k30if0wh0ie2d90ie2iu0id29t0id1m70id0yl0id2fe0ic1ir0ic0v50ic2by0ib10q0ib2hi0ib1kw0ia0xa0ia2e20ia1qg0i92jn0i92am0i91n00i90zf0i82g70i81jk0i80vz0i72cr0i72ic0i61lp0i60y30i62ew0i51i90i50un0i52bg0i41080i42h00i31ke0i30ws0i32dk0i22j50i22a40i21mi0i10yx0i12fp0i11j20i00vh0i02c90hz2ht0hz1l70hz0xl0hy2ed0hy2jy0hx2ax0hx0zq0hx2gi0hw1jw0hw0wa0hw2d20hv2in0hu1m00hu0ye0hu2f70ht1ik0ht0uy0ht2br0hs2hb0hr1kp0hr0x30hr2dv0hq2jg0hq2af0hq1mu0hq0z80hp2g00hp1je0hp0vs0ho2ck0ho2i50hn1li0hn0xw0hm2ep0hm2k90hm0ug0hl2b90hl1010hl2gt0hk1k70hk0wl0hk2dd0hj2iy0hj29x0hi1mb0hi0yq0hi2fi0hh1iv0hh0va0hh2c20hg2hn0hg1l00hf0xe0hf2e70he2jr0he2ar0he0zj0hd2gb0hd1jp0hd0w30hc2cv0hc2ig0hb1lt0hb0y80hb2f00ha1id0ha2kk0ha0us0h92bk0h910c0h92h40h81ki0h80ww0h82do0h72j90h72a80h61mn0h60z10h62ft0h51j70h50vl0h52cd0h42hy0h41lb0h30xp0h32ei0h22k20h20u90h22b20h20zu0h12gm0h11k00h10we0h02d60h02ir0gz1m50gz0yj0gy2fb0gy1ip0gy0v30gx2bv0gx2hg0gw1kt0gw0x70gw2e00gv2jk0gu2ak0gu0zc0gu2g40gt1ji0gt0vw0gt2co0gs2i90gr1lm0gr0y10gr2et0gq2ke0gq0ul0gq2bd0gp2gy0go1kb0go0wp0go2di0gn2j20gn2a20gn1mg0gn0yu0gm2fm0gm1j00gl0ve0gl2c60gk2hr0gk1l40gk0xj0gj2eb0gj2jv0gi2av0gi0zn0gh2gf0gh1jt0gh0w70gg2cz0gg2ik0gf1ly0gf0yc0gf2f40ge0uw0gd2bo0gd2h90gc1km0gc0x00gc2dt0gb2jd0ga2ad0ga0z50ga2fx0g91jb0g90vp0g92ch0g82i20g71lg0g70xu0g72em0g62k70g60ue0g62b60g52gr0g41k40g40wi0g42db0g32iv0g20yn0g22ff0g10v70g12bz0g02hk0g01kx0fz0xc0fy2jp0fy2ao0fx2g90fx1jm0fw0w00fv2id0fv1lr0fv0y50ft0up0ft2bh0fs2h20fs1kf0fs0wu0fr2j60fq2a60fq0yy0fp2fq0fp1j40fp0vi0fo2ca0fn2hv0fn0xn0fm2k00fm0u70fl2az0fk2gk0fk1jx0fk0wb0fj2io0fi0yg0fh0v00fg2hd0ff0x50fe2ji0fd2ah0fc0vt0fb2i60fa0xy0f90ui0f82gv0f70wn0f62j00f40vb0f32ho0f20xg0f10u00ez0w50ey2ih0ev0ut0eu2h60eu0wy0es2jb0eq0vm0ep2hz0eo0xr0en0ub0el0wg0ek2it0ei0v40eh2hh0eg0x90ef0tt0ed0vy0ec2rb0ec2ib0ea0um0e80wr0e50vg0e42qt0e10u40dz0w90dw0ux0dt0tm0dr0vr0dn0uf0dk2ix0di0v90df0tx0db2if0d90ur0d82q40d60tf0d40vk0d00u80cz2pm0cx2iq0cv0v20cr0tq0cq2p40cp0vv0cl0uk0ch2om0cg0vd0cc0u20cb2pf0c60uv0c30tj0c22ox0bx0ud0br0v60bn0tv0bh0uo0bd0td0b70u60aw0to0aq0uh0am0t60af0tz0a90us09x0ua09q0v30760x506m2fk06l26k06h28o06g2e906d2at06c21s06c2gd06b1ss06b27d0692cx06823x0682ii06729h0652f20651rg0642610631x10632bm06222l0612h70611tl06028605y2dr05y1q505x24q05x2jb05w1vq05w2ab05v21a05u2fv05u1sa05t26v05s0vn05r2cf05q23f05q2i005p1ue05p28z05o1zz05n2ek05n1qy05m25j05l2k505l0uc05l1wj05k2b405k1ni05j22305j2gp05i1t305h27o05h2m905h0wg05g1yn05g2d905f1pn05f24805e1gm05e2it05d1v705d29t05c1m705c20s05b2fd05b1rr05a26d0591ir0592ky0582bx0581ob05722x0561fb0562hi0561tw05528h0551kv0542n30541zh0532e20531qg0522510511hf0512jn0510tu0511w10502am0501n004z2p704z21l04y1dz04y2g704y1sl04x27604w1jk04w2lr04w0vy04w1y504v1aj04v2cr04u1p504u23q04t1g404t2ib04s1up04s29b04r1lp04r2nw04q20a04q1co04q2ev04p0p204p1r904o25v04o1i904o2kg04n0un04n1wu04m2bf04m0lm04m1nt04l22f04l1et04k2h004k1te04j27z04i1kd04i2mk04i0ws04i1yz04h1bd04h2dk04h0nr04g1py04g24j04f1gx04f2j404e0tc04e1vj04d2a404d1mi04c21304b1dh04b2fo04b0pw04b1s304a26o04a0gv0491j20492l90490vg0481xn0481a10482c80470mg0471on0462380460df0461fm0452ht0450s00451u704428s0440j00431l70432ne0421zs0421c60412ed0410ok0411qr04025c0400fk03z1hr03z2jy03z0u503z1wc03y18q03y2ax03x0l403x1nb03w21w03w0c403v1eb03v2gi03v0qp03v1sw03u27h03t0ho03t1jv03t2m203s1yh03r1av03r2d203r0n903q1pg03q24103p0e803p1gf03p2im03o1v103n17f03n29m03n0jt03m1m003l20l03l0as03l1cz03k2f603k0pd03k1rl03j26603i0gd03i1ik03i2kr03h1x503h07c03g19j03g2bq03g0lx03f1o503e22q03e0cx03d1f403d2hb03d0ri03c1tp03c16303b28a03b0ih03b1kp03a2mw03a1za03909h0391bo0382dv0380o20381q903724u0360f10361h90352jg0351vu0341880342af0330km0331mt03221e0310bl0311dt0302g00300q70301se02z14s02z26z02y0h602y1jd02x2lk02w1xy02w1ad02v2ck02v0mr02u1oy02u11c02t23j02t0dq02s1fx02s2i402r0sb02r1ui02q16x02q29402p0jb02p1li02o20302n0aa02n1ch02m2eo02m0ov02l1r202k25o02j0fv02j1i202j2k902i0ug02i1wn02h19102g2b802g0lf02f1nm02e22802d0cf02d1em02c2gt02c0r002b1t702a15l02a27s0290hz0291k60282me0280wl0271ys02608z0261b60252dd0250nk0241pr02312502324c0220ej0211gq0212iy0200t50201vc01y17q01y29x01x0k401x1mb01w2oi01v0yp01v20w01u0b301t1da01t2fi01s0pp01r1rw01q14a01p26h01p0go01o1iv01n2l201n0v901m1xg01k19u01k2c201j0m9';

  var totalLandN = (LAND_DATA.length / 6) | 0;
  // On mobile: sample every other point (~2200 instead of ~4400). The
  // Fibonacci-sphere ordering means a stride-2 walk still covers the
  // whole globe evenly — visually it stays dense.
  var landStride = IS_MOBILE ? 2 : 1;
  var landN = Math.floor(totalLandN / landStride);
  var land = new Float32Array(landN * 3);
  (function decode() {
    for (var i = 0; i < landN; i++) {
      var srcOff = (i * landStride) * 6;
      var lat = parseInt(LAND_DATA.slice(srcOff, srcOff + 3), 36) / 10 - 90;
      var lon = parseInt(LAND_DATA.slice(srcOff + 3, srcOff + 6), 36) / 10 - 180;
      var cl = Math.cos(lat * D2R);
      land[i * 3] = cl * Math.sin(lon * D2R);   // x — east on the right
      land[i * 3 + 1] = Math.sin(lat * D2R);    // y — north up
      land[i * 3 + 2] = cl * Math.cos(lon * D2R); // z — toward viewer at lon −phi
    }
  })();

  /* ── Cities (lat, lon) ───────────────────────────────────────── */
  var CITIES = [
    40.7128, -74.0060,   // 0  New York
    51.5074, -0.1278,    // 1  London
    35.6762, 139.6503,   // 2  Tokyo
    37.7749, -122.4194,  // 3  San Francisco
    25.7617, -80.1918,   // 4  Miami
    52.5200, 13.4050,    // 5  Berlin
    1.3521, 103.8198,    // 6  Singapore
    25.2048, 55.2708,    // 7  Dubai
    19.0760, 72.8777,    // 8  Mumbai
    -23.5505, -46.6333,  // 9  São Paulo
    -33.8688, 151.2093,  // 10 Sydney
    48.8566, 2.3522,     // 11 Paris
    22.3193, 114.1694,   // 12 Hong Kong
    34.0522, -118.2437,  // 13 Los Angeles
    41.8781, -87.6298,   // 14 Chicago
    43.6532, -79.3832,   // 15 Toronto
    52.3676, 4.9041,     // 16 Amsterdam
    47.3769, 8.5417,     // 17 Zurich
    37.5665, 126.9780,   // 18 Seoul
    31.2304, 121.4737,   // 19 Shanghai
    19.4326, -99.1332,   // 20 Mexico City
    6.5244, 3.3792,      // 21 Lagos
    -33.9249, 18.4241,   // 22 Cape Town
    41.0082, 28.9784,    // 23 Istanbul
    13.7563, 100.5018,   // 24 Bangkok
    -34.6037, -58.3816,  // 25 Buenos Aires
    40.4168, -3.7038,    // 26 Madrid
    59.3293, 18.0686,    // 27 Stockholm
    49.2827, -123.1207,  // 28 Vancouver
    32.0853, 34.7818     // 29 Tel Aviv
  ];
  var cityN = CITIES.length / 2;
  var cityV = new Float32Array(cityN * 3);
  for (var ci = 0; ci < cityN; ci++) {
    var cla = CITIES[ci * 2] * D2R, clo = CITIES[ci * 2 + 1] * D2R;
    cityV[ci * 3] = Math.cos(cla) * Math.sin(clo);
    cityV[ci * 3 + 1] = Math.sin(cla);
    cityV[ci * 3 + 2] = Math.cos(cla) * Math.cos(clo);
  }
  // per-frame projected city state
  var cityX = new Float32Array(cityN);
  var cityY = new Float32Array(cityN);
  var cityZ = new Float32Array(cityN);
  var cityPulseT = new Float32Array(cityN); // last pulse time (−9 = never)
  for (var pi = 0; pi < cityN; pi++) cityPulseT[pi] = -9;

  /* ── Pre-rendered glow sprite (no shadowBlur, ever) ──────────── */
  function makeGlow(rgb, alpha) {
    var s = document.createElement('canvas');
    s.width = s.height = 64;
    var c = s.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    g.addColorStop(0.35, 'rgba(' + rgb + ',' + alpha * 0.45 + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return s;
  }
  var cityGlow = makeGlow(CH, 0.30);
  var headGlow = makeGlow(LT, 0.5);

  /* ── Land alpha buckets: 8 fillStyles, not 4500 ──────────────── */
  var NB = 8;
  var bucketCol = [];
  for (var bi = 0; bi < NB; bi++) {
    var ba = CONFIG.dotAlphaBase + CONFIG.dotAlphaGain * ((bi + 0.5) / NB);
    bucketCol.push('rgba(' + CREAM + ',' + ba.toFixed(3) + ')');
  }
  var bucketPts = [];
  var bucketCnt = new Int32Array(NB);
  for (var bj = 0; bj < NB; bj++) bucketPts.push(new Float32Array(landN * 2));

  /* ── Geometry / sizing ───────────────────────────────────────── */
  var W = 1, H = 1, CX = 0, CY = 0, R = 1;
  var discGrad = null;
  // Mobile: cap at 1.5 — sharp enough on retina, half the fragments.
  var maxDPR = IS_MOBILE ? 1.5 : 2;
  var dprSteps = [Math.min(window.devicePixelRatio || 1, maxDPR)];
  if (dprSteps[0] > 1.5) dprSteps.push(1.5);
  if (dprSteps[0] > 1.25) dprSteps.push(1.25);
  var dprIdx = 0;
  var DPR = dprSteps[0];

  function applyDPR() {
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
  }

  function resize() {
    var b = host.getBoundingClientRect();
    var w = Math.max(1, b.width), h = Math.max(1, b.height);
    if (w === W && h === H && discGrad) return;
    W = w; H = h;
    CX = W / 2;
    CY = H * CONFIG.centerYFrac;
    R = Math.min(CONFIG.radiusHFrac * H, CONFIG.radiusWFrac * W);
    applyDPR();
    // Sphere base: lifted navy centre → navy → near-black limb.
    discGrad = ctx.createRadialGradient(
      CX, CY - R * 0.35, R * 0.10,
      CX, CY, R
    );
    discGrad.addColorStop(0, '#123055');
    discGrad.addColorStop(0.55, '#0B1F3A');
    discGrad.addColorStop(0.92, '#0A1B33');
    discGrad.addColorStop(1, '#071425');
  }

  /* ── Rotation + projection ───────────────────────────────────── */
  var sinP = 0, cosP = 1, sinT = 0, cosT = 1;

  function setRotation(phi, tilt) {
    sinP = Math.sin(phi); cosP = Math.cos(phi);
    sinT = Math.sin(tilt); cosT = Math.cos(tilt);
  }
  // rotate (x,y,z) by Ry(phi) then Rx(tilt); results in rx, ry, rz
  var rx = 0, ry = 0, rz = 0;
  function rot(x, y, z) {
    var x1 = x * cosP + z * sinP;
    var z1 = -x * sinP + z * cosP;
    rx = x1;
    ry = y * cosT - z1 * sinT;
    rz = y * sinT + z1 * cosT;   // depth, toward viewer
  }

  function easeOutCubic(q) { return 1 - Math.pow(1 - q, 3); }
  function easeInOutCubic(q) {
    return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ── Arcs — introductions across the world ───────────────────── */
  var arcs = [];   // { a, b, t0, pts: Float32Array((S+1)*3) }
  var AS = CONFIG.arcSamples;
  var arcSX = new Float32Array(AS + 1);
  var arcSY = new Float32Array(AS + 1);
  var arcVis = new Uint8Array(AS + 1);

  function makeArc(a, b, t0) {
    var ax = cityV[a * 3], ay = cityV[a * 3 + 1], az = cityV[a * 3 + 2];
    var bx = cityV[b * 3], by = cityV[b * 3 + 1], bz = cityV[b * 3 + 2];
    var dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
    var ang = Math.acos(dot);
    if (ang < 0.02 || ang > 2.1) return null;   // skip near-antipodal limb-huggers
    var sinA = Math.sin(ang);
    var amp = 0.10 + 0.22 * (ang / Math.PI);
    var pts = new Float32Array((AS + 1) * 3);
    for (var i = 0; i <= AS; i++) {
      var u = i / AS;
      var w1 = Math.sin((1 - u) * ang) / sinA;
      var w2 = Math.sin(u * ang) / sinA;
      var s = 1 + Math.sin(Math.PI * u) * amp;   // radial lift
      pts[i * 3] = (w1 * ax + w2 * bx) * s;
      pts[i * 3 + 1] = (w1 * ay + w2 * by) * s;
      pts[i * 3 + 2] = (w1 * az + w2 * bz) * s;
    }
    return { a: a, b: b, t0: t0, pts: pts };
  }

  function drawArc(A, t) {
    var age = t - A.t0;
    var total = CONFIG.arcGrow + CONFIG.arcHold + CONFIG.arcFade;
    if (age >= total) return false;
    var growing = age < CONFIG.arcGrow;
    var headFrac = growing ? easeInOutCubic(age / CONFIG.arcGrow) : 1;
    var life = age < CONFIG.arcGrow + CONFIG.arcHold
      ? 1
      : 1 - (age - CONFIG.arcGrow - CONFIG.arcHold) / CONFIG.arcFade;

    var last = Math.max(1, Math.round(headFrac * AS));
    var i, px, py, pz, d;

    // project + occlude: hidden only when behind AND inside the disc
    for (i = 0; i <= last; i++) {
      rot(A.pts[i * 3], A.pts[i * 3 + 1], A.pts[i * 3 + 2]);
      px = CX + R * rx; py = CY - R * ry; pz = rz;
      arcSX[i] = px; arcSY[i] = py;
      if (pz >= 0) { arcVis[i] = 1; continue; }
      d = (px - CX) * (px - CX) + (py - CY) * (py - CY);
      arcVis[i] = (pz > -0.2 && d > R * R) ? 1 : 0; // just cresting the limb
    }

    var path = new Path2D();
    var pen = false, t1x = 0, t1y = 0, t2x = 0, t2y = 0, any = false;
    for (i = 0; i <= last; i++) {
      if (!arcVis[i]) { pen = false; continue; }
      if (!pen) { path.moveTo(arcSX[i], arcSY[i]); pen = true; if (!any) { t1x = arcSX[i]; t1y = arcSY[i]; any = true; } }
      else path.lineTo(arcSX[i], arcSY[i]);
      t2x = arcSX[i]; t2y = arcSY[i];
    }
    if (any) {
      ctx.lineCap = 'round';
      // wide soft under-stroke
      ctx.strokeStyle = 'rgba(' + CH + ',' + (0.13 * life).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.stroke(path);
      // thin bright thread, brighter toward the moving head
      var g = ctx.createLinearGradient(t1x, t1y, t2x, t2y);
      g.addColorStop(0, 'rgba(' + CH + ',' + (0.75 * life).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + LT + ',' + (0.95 * life).toFixed(3) + ')');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.3;
      ctx.stroke(path);
    }
    // bright head while growing
    if (growing && arcVis[last]) {
      ctx.drawImage(headGlow, arcSX[last] - 7, arcSY[last] - 7, 14, 14);
      ctx.fillStyle = 'rgba(' + LT + ',0.95)';
      ctx.beginPath();
      ctx.arc(arcSX[last], arcSY[last], 1.6, 0, TAU);
      ctx.fill();
    }
    // endpoint glows while the thread lives
    var e;
    for (e = 0; e < 2; e++) {
      var cIdx = e ? A.b : A.a;
      if (cityZ[cIdx] > 0.05) {
        ctx.globalAlpha = 0.5 * life;
        ctx.drawImage(cityGlow, cityX[cIdx] - 8, cityY[cIdx] - 8, 16, 16);
        ctx.globalAlpha = 1;
      }
    }
    return true;
  }

  /* ── Scene ───────────────────────────────────────────────────── */
  var staticLit = null;   // Uint8Array in static mode: steady-glow cities

  function drawScene(phi, tilt, t) {
    setRotation(phi, tilt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // sphere base
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, TAU);
    ctx.fill();

    // whisper of champagne rim light on the upper limb
    ctx.strokeStyle = 'rgba(' + CH + ',0.04)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, R - 1.5, Math.PI * -0.92, Math.PI * -0.08);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + CH + ',0.09)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(CX, CY, R - 0.8, Math.PI * -0.88, Math.PI * -0.12);
    ctx.stroke();

    // land dots, bucketed by depth
    var i, b, sx, sy;
    for (b = 0; b < NB; b++) bucketCnt[b] = 0;
    var dr = Math.max(1.0, Math.min(1.3, R / 430)) * CONFIG.dotRadius;
    for (i = 0; i < landN; i++) {
      rot(land[i * 3], land[i * 3 + 1], land[i * 3 + 2]);
      if (rz <= 0) continue;                    // back hemisphere: gone
      sy = CY - R * ry;
      if (sy > H + 4 || sy < -4) continue;      // below/above the hero
      sx = CX + R * rx;
      b = (rz * NB) | 0; if (b >= NB) b = NB - 1;
      var arr = bucketPts[b], c2 = bucketCnt[b];
      arr[c2] = sx; arr[c2 + 1] = sy;
      bucketCnt[b] = c2 + 2;
    }
    for (b = 0; b < NB; b++) {
      var cnt = bucketCnt[b];
      if (!cnt) continue;
      ctx.fillStyle = bucketCol[b];
      ctx.beginPath();
      var pts2 = bucketPts[b];
      for (i = 0; i < cnt; i += 2) {
        ctx.moveTo(pts2[i] + dr, pts2[i + 1]);
        ctx.arc(pts2[i], pts2[i + 1], dr, 0, TAU);
      }
      ctx.fill();
    }

    // cities
    for (i = 0; i < cityN; i++) {
      rot(cityV[i * 3], cityV[i * 3 + 1], cityV[i * 3 + 2]);
      cityZ[i] = rz;
      cityX[i] = CX + R * rx;
      cityY[i] = CY - R * ry;
      if (rz <= 0.05) continue;
      var z = rz;
      var boost = 0;
      if (staticLit && staticLit[i]) boost = 0.9;
      else {
        var age = t - cityPulseT[i];
        if (age < CONFIG.pulseDur) boost = 1 - age / CONFIG.pulseDur;
      }
      // soft glow beneath
      var gs = 22 * (0.55 + 0.45 * z) * (1 + 0.9 * boost);
      ctx.globalAlpha = (0.35 + 0.65 * z) * (1 + 0.6 * boost);
      if (ctx.globalAlpha > 1) ctx.globalAlpha = 1;
      ctx.drawImage(cityGlow, cityX[i] - gs / 2, cityY[i] - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      // core
      var ca = 0.9 * (0.30 + 0.70 * z);
      var cr = 1.7 * (1 + 0.45 * boost);
      ctx.fillStyle = boost > 0.2
        ? 'rgba(' + LT + ',' + Math.min(1, ca + 0.35 * boost).toFixed(3) + ')'
        : 'rgba(' + CH + ',' + ca.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cityX[i], cityY[i], cr, 0, TAU);
      ctx.fill();
    }

    // pulse rings — a new connection
    for (i = 0; i < cityN; i++) {
      var pAge = t - cityPulseT[i];
      if (pAge < 0 || pAge >= CONFIG.pulseDur || cityZ[i] <= 0.05) continue;
      var q = easeOutCubic(pAge / CONFIG.pulseDur);
      ctx.globalAlpha = 0.5 * (1 - pAge / CONFIG.pulseDur);
      ctx.strokeStyle = 'rgb(' + CH + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cityX[i], cityY[i], 2 + 13 * q, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // arcs
    for (i = arcs.length - 1; i >= 0; i--) {
      if (!drawArc(arcs[i], t)) arcs.splice(i, 1);
    }
  }

  /* ── STATIC mode: one composed frame, then silence ───────────── */
  host.appendChild(canvas);

  if (!ANIMATED) {
    resize();
    staticLit = new Uint8Array(cityN);
    staticLit[0] = 1;   // New York
    staticLit[1] = 1;   // London
    staticLit[11] = 1;  // Paris
    staticLit[4] = 1;   // Miami
    var st = 100;
    var holdT = st - CONFIG.arcGrow - CONFIG.arcHold * 0.5; // mid-hold: full, no head
    var a1 = makeArc(0, 1, holdT);   // NYC — London
    var a2 = makeArc(4, 11, holdT);  // Miami — Paris
    if (a1) arcs.push(a1);
    if (a2) arcs.push(a2);
    drawScene(CONFIG.staticViewDeg * -D2R, CONFIG.tiltDeg * D2R, st);
    arcs.length = 0;
    return;
  }

  /* ── ANIMATED mode ───────────────────────────────────────────── */
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity ' + CONFIG.fadeInSec + 's ease-out';

  var phi0 = CONFIG.staticViewDeg * -D2R;   // boot on the Atlantic view
  var t0 = performance.now() / 1000;
  var nextPulse = rand(0.4, 0.8);           // first connection arrives early
  var litList = [0];                        // recently-lit cities, newest first
                                            // (seeded with New York so the very
                                            //  first pulse can draw a thread)

  // mouse parallax — desktop only (mobile has no mouse; skipping the
  // listener entirely keeps the passive-event budget clean)
  var tYaw = 0, tPitch = 0, yaw = 0, pitch = 0;
  var yawMax = CONFIG.yawMaxDeg * D2R, pitchMax = CONFIG.pitchMaxDeg * D2R;
  if (!IS_MOBILE) {
    window.addEventListener('mousemove', function (e) {
      tYaw = (e.clientX / window.innerWidth - 0.5) * 2 * yawMax;
      tPitch = (e.clientY / window.innerHeight - 0.5) * 2 * pitchMax;
    }, { passive: true });
  }

  function spawnPulse(t) {
    nextPulse = t + rand(CONFIG.pulseMin, CONFIG.pulseMax);
    var front = [];
    for (var i = 0; i < cityN; i++) {
      if (cityZ[i] > 0.15 && t - cityPulseT[i] > CONFIG.pulseDur) front.push(i);
    }
    if (!front.length) return;
    var pick = front[(Math.random() * front.length) | 0];
    cityPulseT[pick] = t;

    // an introduction: thread back to someone lit before
    if (arcs.length < CONFIG.arcMax && Math.random() < CONFIG.arcChance) {
      for (var j = 0; j < litList.length; j++) {
        var prev = litList[j];
        if (prev !== pick && cityZ[prev] > 0.15) {
          var A = makeArc(prev, pick, t);
          if (A) arcs.push(A);
          break;
        }
      }
    }
    litList.unshift(pick);
    if (litList.length > 8) litList.length = 8;
  }

  /* ── rAF loop with adaptive resolution ───────────────────────── */
  var raf = 0;
  var lastNow = 0;
  var ftAcc = 0, ftCnt = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var t = now / 1000 - t0;

    // rolling frame-time average → step backing store down if straining
    if (lastNow) {
      var dt = now - lastNow;
      if (dt < 100) { ftAcc += dt; ftCnt++; }
      if (ftCnt >= 60) {
        if (ftAcc / ftCnt > 17 && dprIdx < dprSteps.length - 1) {
          dprIdx++;
          DPR = dprSteps[dprIdx];
          applyDPR();
        }
        ftAcc = 0; ftCnt = 0;
      }
    }
    lastNow = now;

    yaw += (tYaw - yaw) * CONFIG.parallaxLerp;
    pitch += (tPitch - pitch) * CONFIG.parallaxLerp;

    var phi = phi0 + TAU * t / CONFIG.rotationSec + yaw;
    var tilt = (CONFIG.tiltDeg + CONFIG.wobbleDeg *
                Math.sin(TAU * t / CONFIG.wobbleSec)) * D2R + pitch;

    drawScene(phi, tilt, t);
    if (t >= nextPulse) spawnPulse(t);
  }

  /* ── Lifecycle ───────────────────────────────────────────────── */
  var inView = true;
  function sync() {
    var run = inView && !document.hidden;
    if (run && !raf) { lastNow = 0; raf = requestAnimationFrame(frame); }
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (es) {
      inView = es[es.length - 1].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(host);
  }
  document.addEventListener('visibilitychange', sync);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(host);
  } else {
    window.addEventListener('resize', resize);
  }

  resize();
  sync();

  // reveal on the frame after first paint so the transition runs
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { canvas.style.opacity = '1'; });
  });
})();
