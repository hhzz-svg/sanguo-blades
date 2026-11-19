import json
R='/home/ubuntu/art/raw/'
CH={
 'zhaoyun':(R+'heroes__zhaoyun_idle.png','Zhao Yun: young handsome general, silver lamellar armor, silver helmet with long white plume, white flowing cape, blue sash, long silver spear with blue tassel'),
 'guanyu':(R+'heroes__guanyu_idle.png','Guan Yu: tall general with red face and very long black beard, green robe over gold-trimmed dark green armor, green headscarf, wielding the Green Dragon crescent-blade glaive (guandao)'),
 'zhangfei':(R+'heroes__zhangfei_idle.png','Zhang Fei: burly fierce general with wild black beard and bulging eyes, dark black iron armor with red cloth accents, wielding a long serpent spear with a wavy snake-shaped blade'),
 'saber':(R+'enemies__saber_idle.png','Yellow Turban rebel foot soldier: yellow headband, ragged brown and tan leather armor, yellow sash, curved saber'),
 'archer':(R+'enemies__archer_idle.png','Yellow Turban rebel archer: yellow headband, ragged brown leather armor, yellow sash, wooden longbow and quiver of arrows'),
 'shield':(R+'enemies__shield_idle.png','Yellow Turban rebel shield bearer: yellow headband, brown lamellar armor, large tall wooden tower shield held in front, short spear'),
 'cavalry':(R+'enemies__cavalry_idle.png','Yellow Turban rebel cavalryman: yellow headband and brown armor, riding a brown war horse, holding a long spear'),
 'zhangjiao':(R+'bosses__zhangjiao_idle.png','Zhang Jiao: old Taoist sorcerer with long white beard, flowing yellow robes, golden headdress, holding a wooden peach sword and a glowing yellow paper talisman'),
 'lvbu':(R+'bosses__lvbu_idle.png','Lu Bu: imposing warlord in ornate crimson red armor, helmet with two very long curved pheasant-tail feathers, red cape, wielding a huge crescent halberd (fang tian ji)'),
}
HEAVY={'zhaoyun':'a lightning-fast multi-thrust spear barrage: 1 crouch, 2 spear drawn back, 3-6 four rapid thrusts at different heights straight to the right with the body lunging further each frame, 7 final powerful thrust at full reach, 8 recover',
 'guanyu':'a colossal overhead crescent glaive cleave: 1 raise glaive behind the head, 2 glaive high above, 3 big step forward, 4 glaive swinging down in front, 5 blade slamming into the ground in front, 6 sweeping upward, 7 follow-through, 8 recover',
 'zhangfei':'a thunderous war roar and ground slam: 1 crouch gathering strength, 2 spear raised high with both hands, 3 roaring with mouth wide open and chest out, 4 still roaring arms spread, 5 jumping up, 6 slamming spear butt into the ground, 7 hunched after impact, 8 recover'}
MUSOU={'zhaoyun':'his ultimate charge: 1 spear held vertical in a focused stance, 2 crouch to sprint, 3 explosive dash forward low, 4 spinning spear in a full circle, 5 leaping upward with spear raised, 6 diving downward spear first, 7 landing with spear thrust into ground, 8 heroic pose spear pointed right',
 'guanyu':'his ultimate strike: 1 stroking his beard calmly, 2 lifting glaive with both hands, 3 glaive raised straight above head, 4 leaping forward, 5 mid-air downward cleave, 6 landing cleave into ground, 7 sweeping glaive horizontally, 8 glaive planted beside him in a proud pose',
 'zhangfei':'his ultimate rampage: 1 spear across shoulders, 2 deep breath crouch, 3 furious roar, 4 spinning his spear around his body, 5 second spin, 6 huge leap with spear overhead, 7 crashing down smashing spear into ground, 8 standing tall roaring'}
LIGHT={'zhaoyun':('a fast horizontal spear thrust','a quick backhand spear sweep','a double thrust with step forward','an upward rising spear sweep that would launch an enemy into the air','a leaping spinning spear finisher ending in a strong forward thrust'),
 'guanyu':('a heavy horizontal glaive slash','a reverse backhand glaive slash','a diagonal downward glaive chop','a powerful upward glaive swing that would launch an enemy into the air','a full spinning glaive finisher ending in a huge forward cleave'),
 'zhangfei':('a brutal forward spear jab','a wide horizontal spear swing','an overhead spear smash','an upward spear uppercut that would launch an enemy into the air','a leaping body-slam spear finisher crashing down forward')}
STYLE=('Detailed painted Chinese Three Kingdoms wuxia game art style exactly matching the reference image. The character is identical in every cell: same face, costume, colors, weapon and scale, full body visible including feet and the whole weapon, no cropping, feet on the same ground line in every cell, generous empty space between cells. '
       'Background: completely flat pure green #00FF00 everywhere, no shadows, no ground, no motion lines, no visual effects, no grid lines, no text, no borders, no frame numbers.')
def sheet(desc, layout, frames):
    return f'2D side-scrolling action game animation sprite sheet of the exact same character shown in the reference image ({desc}). Layout: {layout}. Every frame is in full side view facing RIGHT. Frames: {frames}. ' + STYLE
G8='a strict grid of 4 columns x 2 rows = 8 equal cells, read left-to-right then top-to-bottom'
jobs=[]
def add(id, char, layout, frames, rows):
    jobs.append(dict(id=id, ref=CH[char][0], prompt=sheet(CH[char][1], layout, frames), rows=rows))
for h in ['zhaoyun','guanyu','zhangfei']:
    L=LIGHT[h]
    if h!='zhaoyun':
        add(f'{h}_run',h,G8,'a smooth looping RUN CYCLE holding the weapon forward: 1 contact right foot forward, 2 down, 3 passing, 4 up, 5 contact left foot forward, 6 down, 7 passing, 8 up',[('run','air',8)])
    add(f'{h}_light1',h,G8,f'frames 1-4 are {L[0]} (1 anticipation, 2 swing, 3 impact at full reach, 4 follow-through); frames 5-8 are {L[1]} (5 anticipation, 6 swing, 7 impact, 8 follow-through)',[('light1','ground',4),('light2','ground',4)])
    add(f'{h}_light2',h,G8,f'frames 1-4 are {L[2]} (1 anticipation, 2 swing, 3 impact, 4 follow-through); frames 5-8 are {L[3]} (5 low crouch, 6 swing rising, 7 weapon high above at the end of the rising swing, 8 follow-through)',[('light3','ground',4),('light4','ground',4)])
    add(f'{h}_light3',h,G8,f'eight frames of {L[4]}: 1 anticipation crouch, 2 jump, 3 spin, 4 spin, 5 apex weapon raised, 6 strike down, 7 impact, 8 recover to ready stance',[('light5','ground',8)])
    add(f'{h}_heavy',h,G8,HEAVY[h],[('heavy','ground',8)])
    add(f'{h}_musou',h,G8,MUSOU[h],[('musou','air',8)])
    add(f'{h}_idlejump',h,G8,'top row frames 1-4 are a subtle IDLE breathing loop in a ready combat stance with weapon held forward (tiny differences in chest, cape and plume); bottom row frames 5-8 are a JUMP: 5 crouch before takeoff, 6 rising with knees tucked, 7 apex in the air, 8 falling with legs extended down',[('idle','ground',4),('jump','air',4)])
    add(f'{h}_dodgehurt',h,G8,'top row frames 1-4 are a fast low forward DODGE DASH (1 lean forward, 2 low dash with cape streaming, 3 low dash, 4 recovering upright); bottom row: 5 HIT REACTION recoiling backward in pain, 6 staggering backward, 7 knocked down falling backward, 8 lying on the ground on his back',[('dodge','ground',4),('hurt','ground',2),('down','ground',2)])
for e,walk,atk in [('saber','walking forward with saber ready','a saber slash: 5 raise saber, 6 saber high, 7 slash down, 8 follow-through'),
                   ('archer','walking forward carrying the bow','shooting the bow: 5 nock arrow, 6 draw bow fully aiming right, 7 release with arrow gone, 8 lower bow'),
                   ('shield','advancing slowly behind the tower shield','a shield bash and spear stab: 5 brace, 6 shield bash forward, 7 spear stab past the shield, 8 recover'),
                   ('cavalry','a galloping horse cycle with the rider holding the spear forward (4 gallop phases)','a mounted charge thrust: 5 horse rearing, 6 charging forward, 7 rider thrusting spear forward, 8 recover')]:
    add(f'{e}_a',e,G8,f'top row frames 1-4 are {walk} (a looping cycle); bottom row frames 5-8 are {atk}',[('walk','ground',4),('attack','ground',4)])
    add(f'{e}_b',e,G8,'top row: 1 hit reaction flinching backward, 2 staggering backward, 3 launched into the air flailing, 4 tumbling in the air; bottom row: 5 falling backward, 6 hitting the ground, 7 lying on the ground, 8 lying motionless defeated on the ground',[('hurt','ground',2),('air','air',2),('death','ground',4)])
add('zhangjiao_a','zhangjiao',G8,'top row frames 1-4 are a floating walk forward with robes swaying; bottom row frames 5-8 are an idle loop chanting with the talisman glowing',[('walk','ground',4),('idle','ground',4)])
add('zhangjiao_b','zhangjiao',G8,'casting a lightning storm spell: 1 raise peach sword, 2 talisman held up, 3 both arms raised to the sky, 4 chanting arms high, 5 thrusting the sword forward, 6 pointing the sword to the sky, 7 slamming the talisman down, 8 recover',[('attack','ground',8)])
add('zhangjiao_c','zhangjiao',G8,'top row: 1 crouching wrapping himself in robes, 2 spinning robes, 3 throwing a talisman forward, 4 hand extended forward; bottom row: 5 hit reaction recoiling, 6 staggering, 7 falling to his knees, 8 collapsed on the ground defeated',[('cast','ground',4),('hurt','ground',2),('death','ground',2)])
add('lvbu_a','lvbu',G8,'top row frames 1-4 are a menacing heavy stride walk forward holding the halberd; bottom row frames 5-8 are an idle loop in a ready stance with feathers and cape swaying',[('walk','ground',4),('idle','ground',4)])
add('lvbu_b','lvbu',G8,'a giant halberd sweep combo: 1 halberd pulled back, 2 wide horizontal sweep, 3 sweep follow-through, 4 reverse spin, 5 halberd raised high overhead, 6 overhead smash down, 7 halberd blade in the ground, 8 recover',[('attack','ground',8)])
add('lvbu_c','lvbu',G8,'top row: 1 lowering into a charging stance, 2 explosive dash forward with halberd pointed forward, 3 dash, 4 skidding stop thrust; bottom row: 5 hit reaction recoiling, 6 staggering, 7 falling to one knee, 8 collapsed on the ground defeated',[('charge','ground',4),('hurt','ground',2),('death','ground',2)])
VFX=[('slash','a white-silver crescent sword slash arc, sharp and luminous, with soft blue-white glow, sweeping from upper left to lower right: 1 thin start, 2-3 arc growing, 4 full bright crescent, 5-8 dissolving into sparkles and fading'),
     ('slash_gold','a huge emerald green and gold crescent blade wave with a glowing dragon-scale texture: 1 small, 2-4 growing to a full massive crescent, 5-8 dissipating into green-gold embers'),
     ('thrust','a horizontal spear thrust energy streak pointing right, white core with blue glow and speed lines: 1 small spark, 2-3 streak extending, 4 full long streak, 5-8 thinning and fading'),
     ('impact','a bright combat hit impact burst, white-hot center with orange sparks shooting outward in a star shape: 1 tiny flash, 2-3 expanding star burst, 4 largest, 5-8 sparks scattering and fading'),
     ('fire','a fiery explosion with orange and yellow flames and smoke: 1 small flash, 2-4 expanding fireball, 5-6 billowing flames, 7-8 fading embers and smoke'),
     ('lightning','a vertical lightning bolt striking down from the top of the cell to the bottom, electric yellow-white with purple glow, with a small impact flash at the bottom: each frame a different jagged bolt shape, 1 faint, 2-5 bright, 6-8 fading'),
     ('dust','a ground dust cloud puff kicked up horizontally, warm brown and tan smoke: 1 small, 2-4 expanding, 5-8 dissipating'),
     ('dragon_azure','a glowing azure-blue Chinese dragon made of light and energy flying to the right: 1 dragon head emerging, 2-4 full serpentine dragon body surging forward, 5-6 dragon roaring, 7-8 dragon dissolving into blue light particles'),
     ('dragon_green','a glowing emerald-green Chinese dragon made of light and energy flying to the right: 1 dragon head emerging, 2-4 full serpentine dragon body surging forward, 5-6 dragon roaring, 7-8 dragon dissolving into green light particles'),
     ('shockwave','a red-orange ground shockwave ring with debris and rock fragments blasting outward, seen in perspective from the side: 1 small ring, 2-4 expanding ring with flying rocks, 5-8 fading dust')]
for v,d in VFX:
    jobs.append(dict(id=f'vfx_{v}', ref=None, rows=[(v,'vfx',8)], prompt=f'2D game visual effect animation sprite sheet. Layout: {G8}. The effect is centered in each cell with empty space around it. Frames: {d}. High quality painted anime/wuxia game VFX, luminous and vibrant. Background: completely flat pure black #000000 everywhere, no characters, no text, no grid lines, no borders, no frame numbers.'))
json.dump(jobs, open('/home/ubuntu/art/anim/manifest.json','w'), ensure_ascii=False, indent=1)
print(len(jobs))
