import os, json, numpy as np
from PIL import Image
from scipy import ndimage
import sys
J=json.load(open(os.path.expanduser('~/art/anim/manifest.json')))
ONLY=sys.argv[1:]
J.insert(0, dict(id='zhaoyun_run', rows=[('run','air',8)]))
OUT=os.path.expanduser('~/repos/sanguo-blades/public/assets/anim'); os.makedirs(OUT,exist_ok=True)
SC=0.8  # downscale factor for output
COLS,ROWS=4,2
manifest={}
def key(a):
    r,g,b=a[...,0],a[...,1],a[...,2]; m=g-np.maximum(r,b)
    alpha=np.clip(1-(m-25)/70,0,1)
    a=a.copy(); a[...,1]=np.where(m>0,np.minimum(g,np.maximum(r,b)+10),g)
    return np.dstack([a,alpha*255]).astype(np.uint8), alpha>0.15
for j in J:
    if ONLY and j['id'] not in ONLY: continue
    sid=j['id']; char=sid.rsplit('_',1)[0] if not sid.startswith('vfx_') else 'vfx'
    a=np.asarray(Image.open(os.path.expanduser(f'~/art/anim/sheets/{sid}.png')).convert('RGB')).astype(np.float32)
    H,W=a.shape[:2]; cw,ch=W/COLS,H/ROWS
    idx=0
    if char=='vfx':
        name,_,n=j['rows'][0]
        cells=[Image.fromarray(a[int((i//COLS)*ch):int((i//COLS+1)*ch), int((i%COLS)*cw):int((i%COLS+1)*cw)].astype(np.uint8)) for i in range(n)]
        cells=[c.resize((int(c.width*0.75),int(c.height*0.75)),Image.LANCZOS) for c in cells]
        w,h=cells[0].size; s=Image.new('RGB',(w*n,h))
        for i,c in enumerate(cells): s.paste(c,(i*w,0))
        s.save(f'{OUT}/vfx_{name}.webp',quality=88)
        manifest[f'vfx/{name}']=dict(src=f'anim/vfx_{name}.webp',frames=n,w=w,h=h,anchorX=w//2,anchorY=h//2,blend='lighter')
        continue
    rgba,mask=key(a)
    lab,nl=ndimage.label(ndimage.binary_dilation(mask,iterations=3))
    cms=ndimage.center_of_mass(mask,lab,range(1,nl+1)); sizes=ndimage.sum(mask,lab,range(1,nl+1))
    for name,mode,n in j['rows']:
        fr=[]
        for k in range(n):
            i=idx+k; cx,cy=i%COLS,i//COLS
            keep=[q+1 for q,(c,s) in enumerate(zip(cms,sizes)) if s>400 and int(c[1]//cw)==cx and int(c[0]//ch)==cy]
            fm=np.isin(lab,keep)&mask
            if not keep or fm.sum()<2000:
                y0c,x0c=int(cy*ch),int(cx*cw); cell=np.zeros_like(mask); cell[y0c:int(y0c+ch),x0c:int(x0c+cw)]=True
                ov=np.bincount(lab[cell&mask],minlength=nl+1); ov[0]=0; best=int(ov.argmax())
                print('WARN fallback',sid,name,k,'blob',best); fm=(lab==best)&mask
            ys,xs=np.nonzero(fm)
            er=ndimage.binary_erosion(fm,iterations=7); eys,exs=np.nonzero(er)
            if len(eys)==0: eys,exs=ys,xs
            top,bot=eys.min(),eys.max(); hg=bot-top
            band=(eys>=top+0.3*hg)&(eys<=top+0.6*hg)
            ax=exs[band].mean()
            ay=ys.max() if mode=='ground' else cy*ch+ch*0.93
            fr.append((fm,ax,ay,(xs.min(),ys.min(),xs.max(),ys.max()),ys.max()-ys.min()))
        idx+=n
        L=max(f[1]-f[3][0] for f in fr); Rr=max(f[3][2]-f[1] for f in fr)
        U=max(f[2]-f[3][1] for f in fr); D=max(0,max(f[3][3]-f[2] for f in fr))
        CW,CH=int(L+Rr)+8,int(U+D)+8
        ow,oh=int(CW*SC),int(CH*SC)
        strip=Image.new('RGBA',(ow*n,oh))
        for k,(fm,ax,ay,box,_) in enumerate(fr):
            im=rgba.copy(); im[...,3]=np.where(fm,im[...,3],0)
            x0,y0=int(ax-L)-4,int(ay-U)-4
            c=Image.fromarray(im).crop((x0,y0,x0+CW,y0+CH)).resize((ow,oh),Image.LANCZOS)
            strip.paste(c,(k*ow,0))
        fn=f'{char}_{name}'
        strip.save(f'{OUT}/{fn}.webp',quality=90,method=6)
        manifest[f'{char}/{name}']=dict(src=f'anim/{fn}.webp',frames=n,w=ow,h=oh,anchorX=int((L+4)*SC),anchorY=int((U+4)*SC),figureH=int(np.median([f[4] for f in fr])*SC))
old=json.load(open(f'{OUT}/manifest.json')) if ONLY else {}
old.update(manifest)
json.dump(old,open(f'{OUT}/manifest.json','w'),indent=1)
print(len(manifest))
