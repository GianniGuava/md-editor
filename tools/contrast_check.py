# WCAG 2.x relative luminance + contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)

LIGHT=dict(bg='#FFFFFF',surface='#F2F2F2',surface2='#E6E6E6',text='#1A1A1A',text2='#595959',
           border='#767676',accent='#0B57D0',accent_text_on='#FFFFFF',link='#0B57D0',
           selection='#CCE0FF',focus='#0B57D0',disabled='#8C8C8C',code_bg='#F2F2F2',danger='#B3261E',
           tab_active='#FFFFFF',tab_inactive='#E6E6E6')
DARK=dict(bg='#121212',surface='#1E1E1E',surface2='#2A2A2A',text='#E6E6E6',text2='#A6A6A6',
          border='#6E6E6E',accent='#2D6FE0',accent_text_on='#FFFFFF',link='#8AB4F8',
          selection='#1F3A6B',focus='#8AB4F8',disabled='#7A7A7A',code_bg='#1E1E1E',danger='#F2B8B5',
          tab_active='#1E1E1E',tab_inactive='#121212')

HC=dict(bg='#FFFFFF',surface='#F2F2F2',surface2='#E6E6E6',text='#000000',text2='#3D3D3D',
        border='#595959',accent='#0041A8',accent_text_on='#FFFFFF',link='#0041A8',
        selection='#CCE0FF',focus='#0041A8',disabled='#767676',code_bg='#F2F2F2',
        tab_active='#FFFFFF',tab_inactive='#E6E6E6',danger='#8F0000')

def check(name,P,text_req=4.5):
    print(f'\n== {name} ==')
    T=text_req
    pairs=[ # (fg, bg, required ratio, label)
      ('text','bg',T,'body text on page'),('text','surface',T,'text on panel'),
      ('text','surface2',T,'text on toolbar/inactive tab'),
      ('text2','bg',T,'secondary text on page'),('text2','surface',T,'secondary text on panel'),
      ('link','bg',T,'link text on page'),('link','surface',T,'link on panel'),
      ('accent_text_on','accent',T,'button label on accent'),
      ('accent','bg',3.0,'accent button vs page (non-text 1.4.11)'),
      ('border','bg',3.0,'input/border vs page (1.4.11)'),('border','surface',3.0,'border vs panel'),
      ('focus','bg',3.0,'focus ring vs page (2.4.7/2.4.13)'),('focus','surface',3.0,'focus ring vs panel'),
      ('text','selection',T,'text on selection'),
      ('text','code_bg',T,'code text on code bg'),
      ('disabled','bg',3.0,'disabled label vs page (voluntary floor)'),
      ('danger','bg',T,'destructive/error text on page (R-8)'),
      ('danger','surface',T,'destructive/error text on panel (R-8)'),
      ('tab_active','tab_inactive',1.0,'active vs inactive tab (info only)'),
    ]
    ok=True
    for fg,bg,req,label in pairs:
        r=cr(P[fg],P[bg]); flag='PASS' if r>=req else 'FAIL'; ok&= r>=req
        print(f'{flag}  {r:5.2f}:1 (need {req}) {label:45s} {fg}={P[fg]} on {bg}={P[bg]}')
    print('ALL PASS' if ok else 'SOME FAIL')
check('LIGHT',LIGHT); check('DARK',DARK); check('HIGH CONTRAST (AAA text 7:1)',HC,text_req=7.0)
