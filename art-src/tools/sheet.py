import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; files=sys.argv[2:]
th=520; ims=[]
for f in files:
    im=Image.open(f).convert('RGBA'); w=int(im.width*th/im.height); ims.append((f,im.resize((w,th))))
cols=min(len(ims),7); W=sum(i.width for _,i in ims[:cols])+10*(cols+1)
rows=(len(ims)+cols-1)//cols; S=Image.new('RGB',(W,rows*(th+30)+10),(40,36,34)); d=ImageDraw.Draw(S)
x=10;y=10
for k,(f,im) in enumerate(ims):
    if k and k%cols==0: x=10;y+=th+30
    bg=Image.new('RGBA',im.size,(128,128,128,255)); bg.alpha_composite(im); S.paste(bg.convert('RGB'),(x,y)); d.text((x,y+th+4),f.split('/')[-1][:40],fill=(230,220,200)); x+=im.width+10
S.save(out,quality=88); print(S.size)
