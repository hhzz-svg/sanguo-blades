import sys, os, numpy as np
from PIL import Image
RAW=os.path.expanduser('~/art/raw'); OUT=os.path.expanduser('~/repos/sanguo-blades/public/assets')
def key(im):
    a=np.asarray(im.convert('RGB')).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    m=g-np.maximum(r,b)               # greenness
    alpha=np.clip(1-(m-25)/70,0,1)    # m<=25 opaque, m>=95 transparent
    g2=np.minimum(g,np.maximum(r,b)+10)  # despill
    a[...,1]=np.where(m>0,g2,g)
    out=np.dstack([a,alpha*255]).astype(np.uint8)
    img=Image.fromarray(out,'RGBA')
    bb=img.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
    img=img.crop(bb)
    if img.height>512: img=img.resize((round(img.width*512/img.height),512),Image.LANCZOS)
    return img
for f in sorted(os.listdir(RAW)):
    if not f.endswith('.png'): continue
    sub,name=f[:-4].split('__')
    os.makedirs(f'{OUT}/{sub}',exist_ok=True)
    im=Image.open(f'{RAW}/{f}')
    if sub=='scenes':
        im.convert('RGB').save(f'{OUT}/{sub}/{name}.jpg',quality=85)
    elif name.endswith('_card'):
        im.convert('RGB').resize((512,768),Image.LANCZOS).save(f'{OUT}/{sub}/{name}.jpg',quality=86)
    else:
        key(im).save(f'{OUT}/{sub}/{name}.png',optimize=True)
    print('ok',sub,name)
