// Why each of the 16 types is chosen, and the story behind it. Locale order: ja, ko, zh, en.
// basis: the answer pattern that leads here (group scale + the two style poles + the scene pick).
// story: the reading of that pattern, grounded in dream research (knowledge/dream_psychology.md),
//        never a clinical claim. "Premonition" describes an impression, not a prediction.
export const TYPE_LORE = {
  chase: {
    basis: [
      "悪夢の軸が高く、困ったときは「動く」、目が向くのは「外の世界」。怖い夢の場面で「追いかけられて走る」を選ぶ人がここに来ます。",
      "악몽 축이 높고, 곤란할 때는 '움직이며', 시선은 '바깥 세계'로 향해요. 무서운 꿈 장면에서 '쫓겨서 달린다'를 고른 사람이 여기에 와요.",
      "噩梦轴偏高，遇到困难时选择“行动”，视线朝向“外部世界”。在可怕的梦里选择“被追赶奔跑”的人会来到这里。",
      "A high nightmare scale, a style that moves when things go wrong, and a focus on the world outside. Picking “chased and running” in the scene question lands here.",
    ],
    story: [
      "追われる夢は世界中でいちばん多い夢です。脅威シミュレーション理論では、夢は安全な場所で「逃げる練習」をする時間。あなたの心は、現実で向き合いきれていない何かから、まだ走って距離を取っている最中かもしれません。走れているということは、動く力が残っているということでもあります。",
      "쫓기는 꿈은 전 세계에서 가장 흔한 꿈이에요. 위협 시뮬레이션 이론에서는 꿈을 안전한 곳에서 '도망치는 연습'을 하는 시간으로 봐요. 당신의 마음은 현실에서 아직 마주하지 못한 무언가로부터 달리며 거리를 두는 중일지도 몰라요. 달릴 수 있다는 건 움직일 힘이 남아 있다는 뜻이기도 해요.",
      "被追赶是全世界最常见的梦。威胁模拟理论认为，梦是在安全的地方“练习逃跑”的时间。你的心，或许正在与现实里尚未面对的某件事拉开距离。还能奔跑，说明你仍有行动的力量。",
      "Being chased is the most common dream in the world. Threat-simulation theory reads it as a safe rehearsal of escape. Your mind may still be running from something you have not fully faced yet. That you can run at all means the strength to move is still there.",
    ],
  },
  loss: {
    basis: [
      "悪夢の軸が高く、「動く」けれど、目が向くのは「自分の内側」。怖い夢で「大切なものを失って探し回る」を選ぶ人のタイプです。",
      "악몽 축이 높고 '움직이지만', 시선은 '내 안'을 향해요. 무서운 꿈에서 '소중한 것을 잃고 찾아 헤맨다'를 고른 사람의 유형이에요.",
      "噩梦轴偏高，虽然“行动”，视线却朝向“内心”。在可怕的梦里选择“失去珍贵之物、四处寻找”的人属于这一型。",
      "A high nightmare scale, a style that keeps moving, but a focus turned inward. Picking “losing something dear and searching” in the scene question leads here.",
    ],
    story: [
      "失う夢・探す夢は、悲しみや不安を一晩かけて手当てしている夢だと考えられています（情動処理説）。探し続ける姿は、あなたがまだ「大切にする力」を手放していない証です。見つからなくても、探した時間そのものが心を整えていきます。",
      "잃는 꿈, 찾는 꿈은 슬픔과 불안을 하룻밤에 걸쳐 돌보는 꿈이라고 여겨져요(정서 처리 가설). 계속 찾는 모습은 당신이 아직 '소중히 여기는 힘'을 놓지 않았다는 증거예요. 찾지 못해도, 찾던 시간 자체가 마음을 정돈해 가요.",
      "失去与寻找的梦，被认为是一整夜里在照料悲伤与不安（情绪加工假说）。不断寻找的身影，证明你还没有放弃“珍惜的能力”。即使找不到，寻找的时间本身也在整理你的心。",
      "Dreams of losing and searching are thought to be a night's work of tending to sadness and worry (the emotion-processing view). That you keep searching shows you have not let go of your capacity to care. Even without finding, the search itself settles the heart.",
    ],
  },
  bound: {
    basis: [
      "悪夢の軸が高く、困ったときは「見つめる」、目が向くのは「自分の内側」（体の感覚）。怖い夢で「体が動かない・声が出ない」を選ぶ人がここに来ます。",
      "악몽 축이 높고, 곤란할 때는 '바라보며', 시선은 '내 안'(몸의 감각)을 향해요. 무서운 꿈에서 '몸이 안 움직인다·목소리가 안 나온다'를 고른 사람이 여기에 와요.",
      "噩梦轴偏高，遇到困难时选择“静观”，视线朝向“内心”（身体的感觉）。在可怕的梦里选择“动不了、发不出声音”的人会来到这里。",
      "A high nightmare scale, a style that watches rather than moves, and a focus on the inside: the body. Picking “cannot move or speak” in the scene question leads here.",
    ],
    story: [
      "動けない夢や金縛りは、レム睡眠で体が自然に脱力している状態を、目覚めかけた意識が感じ取ることで起きます。危険なものではなく、体が「休む姿勢」を守っているだけ。動けない時間に、あなたはふだん聞こえない小さな感覚に耳を澄ませています。",
      "움직일 수 없는 꿈이나 가위눌림은 렘수면에서 몸이 자연스럽게 힘이 빠진 상태를, 반쯤 깬 의식이 느끼면서 생겨요. 위험한 것이 아니라 몸이 '쉬는 자세'를 지키고 있을 뿐이에요. 움직이지 못하는 시간에 당신은 평소 들리지 않던 작은 감각에 귀를 기울여요.",
      "动不了的梦和“鬼压床”，是半醒的意识察觉到了快速眼动睡眠中身体自然放松的状态。它并不危险，只是身体在守护“休息的姿势”。在无法动弹的时刻，你在倾听平时听不到的细微感觉。",
      "Dreams of being unable to move, and sleep paralysis, happen when a half-awake mind notices the natural muscle relaxation of REM sleep. It is not dangerous: the body is only guarding its resting posture. In that stillness you listen to small sensations you would normally miss.",
    ],
  },
  collapse: {
    basis: [
      "悪夢の軸が高く、困ったときは「見つめる」、目が向くのは「外の世界」。怖い夢で「建物や地面、自分の体が崩れていく」を選ぶ人のタイプです。",
      "악몽 축이 높고, 곤란할 때는 '바라보며', 시선은 '바깥 세계'를 향해요. 무서운 꿈에서 '건물이나 땅, 내 몸이 무너진다'를 고른 사람의 유형이에요.",
      "噩梦轴偏高，遇到困难时选择“静观”，视线朝向“外部世界”。在可怕的梦里选择“建筑、地面或身体崩塌”的人属于这一型。",
      "A high nightmare scale, a style that watches, and a focus on the world outside. Picking “buildings, the ground, or my body fall apart” in the scene question leads here.",
    ],
    story: [
      "崩れる・壊れる夢は、強い感情がひとつの大きなイメージに集まったもの（ハートマンの「中心イメージ」）。津波や地震のような場面の激しさは、抱えている気持ちの大きさのバロメーターです。壊れる場面を最後まで見届けられるあなたには、崩れたあとに組み立て直す視点があります。",
      "무너지는 꿈은 강한 감정이 하나의 커다란 이미지로 모인 것이에요(하트먼의 '중심 이미지'). 해일이나 지진 같은 장면의 강렬함은 품고 있는 감정의 크기를 보여 주는 바로미터예요. 무너지는 장면을 끝까지 지켜볼 수 있는 당신에게는, 무너진 뒤 다시 세우는 시선이 있어요.",
      "崩塌的梦，是强烈的情感汇聚成一个巨大意象（哈特曼的“中心意象”）。海啸、地震般场面的激烈程度，是你所承载情绪大小的晴雨表。能把崩塌看到最后的你，拥有在废墟之上重新搭建的视角。",
      "Dreams of collapse gather a strong feeling into one overwhelming image (Hartmann's “central image”). The intensity of a tsunami or an earthquake scene is a gauge of how much you are carrying. Someone who can watch the fall to the end also has the eye to rebuild afterwards.",
    ],
  },
  future: {
    basis: [
      "予知の軸が高く、夢が「はっきりした場面」として残り、指しているのは「これから」。知らせのかたちで「具体的な出来事があとで本当に起きる」を選ぶ人がここに来ます。",
      "예감 축이 높고, 꿈이 '또렷한 장면'으로 남으며, 가리키는 것은 '앞으로'예요. 알림의 형태로 '구체적인 사건이 나중에 실제로 일어난다'를 고른 사람이 여기에 와요.",
      "预感轴偏高，梦以“清晰的场景”留下，指向“将来”。在提示的形式中选择“具体的事情后来真的发生”的人会来到这里。",
      "A high premonition scale, dreams that remain as clear scenes, and a direction pointing ahead. Picking “a concrete event later really happens” in the scene question leads here.",
    ],
    story: [
      "夢が現実と重なるのは、心が日中に拾った小さな手がかりを、眠っている間につなぎ合わせるからだと考えられています（連続性仮説）。未来を見ているのではなく、まだ言葉になっていない「気づき」を、夢が先に場面にしてくれるのです。あなたは自分の観察力を、夢というかたちで受け取っています。",
      "꿈이 현실과 겹치는 것은 마음이 낮 동안 주운 작은 단서를 자는 사이에 이어 붙이기 때문이라고 여겨져요(연속성 가설). 미래를 보는 것이 아니라, 아직 말이 되지 않은 '알아차림'을 꿈이 먼저 장면으로 만들어 주는 거예요. 당신은 자신의 관찰력을 꿈이라는 형태로 받아 보고 있어요.",
      "梦与现实重合，被认为是因为心在睡眠中把白天拾起的细小线索拼接起来（连续性假说）。不是看见了未来，而是梦先把尚未成形的“察觉”变成了场景。你是以梦的形式，接收着自己的观察力。",
      "Dreams overlap with waking life because the sleeping mind stitches together small cues it picked up during the day (the continuity hypothesis). You are not seeing the future: a dream turns a noticing that has not yet found words into a scene. You receive your own powers of observation in the form of a dream.",
    ],
  },
  intuition: {
    basis: [
      "予知の軸が高く、夢は「雰囲気・気配」として残り、指しているのは「これから」。知らせのかたちで「理由のない嫌な予感だけが残る」を選ぶ人のタイプです。",
      "예감 축이 높고, 꿈은 '분위기·기운'으로 남으며, 가리키는 것은 '앞으로'예요. 알림의 형태로 '이유 없는 불길한 예감만 남는다'를 고른 사람의 유형이에요.",
      "预感轴偏高，梦以“氛围·气息”留下，指向“将来”。在提示的形式中选择“只留下说不清的不祥预感”的人属于这一型。",
      "A high premonition scale, dreams that remain as a mood, and a direction pointing ahead. Picking “an uneasy feeling lingers with no clear reason” in the scene question leads here.",
    ],
    story: [
      "胸騒ぎが残る夢は、日中に感じたけれど言葉にしなかった違和感が、感情だけのかたちで夜に浮かび上がったものと考えられます。健康な人の夢の感情も半分以上は不安や恐れなので、予感そのものは異常ではありません。あなたのセンサーは細やかで、気配を先に受け取ります。予感は「確かめてみよう」の合図に使うのがちょうどいい距離です。",
      "두근거림이 남는 꿈은 낮에 느꼈지만 말로 하지 않은 위화감이 감정만의 형태로 밤에 떠오른 것이라고 볼 수 있어요. 건강한 사람의 꿈 감정도 절반 이상이 불안과 두려움이니, 예감 자체는 이상한 게 아니에요. 당신의 센서는 섬세해서 기운을 먼저 받아들여요. 예감은 '확인해 보자'는 신호로 쓰는 것이 딱 좋은 거리예요.",
      "留下心悸的梦，可以看作白天感受到却没说出口的违和感，在夜里以纯粹情绪的形式浮现。健康人的梦有一半以上带着不安与恐惧，所以预感本身并不异常。你的感应细腻，会先接收到气息。把预感当作“去确认一下”的信号，是恰到好处的距离。",
      "A dream that leaves unease is often a discomfort felt during the day but never put into words, surfacing at night as pure feeling. More than half of healthy people's dream emotions are anxious or fearful, so the feeling itself is not abnormal. Your sensor is fine-tuned and picks up the atmosphere first. Treating a hunch as a cue to check things out is just the right distance.",
    ],
  },
  symbol: {
    basis: [
      "予知の軸が高く、夢は「雰囲気・気配」として残り、指しているのは「見覚え」（あなただけのイメージの言葉）。知らせのかたちで「意味ありげなものが出てくる」を選ぶ人がここに来ます。",
      "예감 축이 높고, 꿈은 '분위기·기운'으로 남으며, 가리키는 것은 '낯익음'(당신만의 이미지 언어)이에요. 알림의 형태로 '의미심장한 것이 나온다'를 고른 사람이 여기에 와요.",
      "预感轴偏高，梦以“氛围·气息”留下，指向“似曾相识”（属于你自己的意象语言）。在提示的形式中选择“出现意味深长的东西”的人会来到这里。",
      "A high premonition scale, dreams that remain as a mood, and a direction toward the familiar: your own private language of images. Picking “meaningful things appear” in the scene question leads here.",
    ],
    story: [
      "動物・水・光・鏡。象徴の意味は人によって正反対になるので、ユメタンは夢占いのように一対一で決めつけません。大切なのは、その象徴からあなた自身が何を連想するか。同じモチーフが繰り返し現れるなら、それはあなたの心が選んだ「合言葉」です。解読者であるあなたは、その合言葉の辞書を少しずつ育てていけます。",
      "동물·물·빛·거울. 상징의 의미는 사람마다 정반대일 수 있어서, 유메탄은 해몽처럼 일대일로 단정하지 않아요. 중요한 건 그 상징에서 당신 자신이 무엇을 떠올리는가예요. 같은 모티프가 반복해서 나타난다면, 그것은 당신의 마음이 고른 '암호'예요. 해독자인 당신은 그 암호의 사전을 조금씩 키워 갈 수 있어요.",
      "动物、水、光、镜子。象征的含义因人而异，甚至截然相反，所以Yumetan不像解梦那样一对一地下结论。重要的是你自己从那个象征联想到什么。如果同一个意象反复出现，那就是你的心选定的“暗号”。作为解读者的你，可以慢慢培育这本暗号词典。",
      "Animals, water, light, mirrors. A symbol can mean opposite things to different people, so Yumetan never decodes them one-to-one like a fortune book. What matters is what you yourself associate with it. When the same motif keeps returning, it is a password your mind has chosen. As the decoder, you can slowly grow the dictionary for it.",
    ],
  },
  deja: {
    basis: [
      "予知の軸が高く、夢が「はっきりした場面」として残り、指しているのは「見覚え」。知らせのかたちで「前にも見たという強い既視感」を選ぶ人のタイプです。",
      "예감 축이 높고, 꿈이 '또렷한 장면'으로 남으며, 가리키는 것은 '낯익음'이에요. 알림의 형태로 '전에도 봤다는 강한 기시감'을 고른 사람의 유형이에요.",
      "预感轴偏高，梦以“清晰的场景”留下，指向“似曾相识”。在提示的形式中选择“以前见过的强烈既视感”的人属于这一型。",
      "A high premonition scale, dreams that remain as clear scenes, and a direction toward the familiar. Picking “a strong sense of having seen this before” in the scene question leads here.",
    ],
    story: [
      "既視感は、記憶の「知っている感じ」だけが、中身より先に立ち上がる現象だと考えられています。夢は子どもの頃の家や学校、昔の道を舞台に選びやすく、そこにはあなたの記憶の地層が重なっています。「見たことがある」という感覚は、心が過去の自分と今の自分を結び直しているサイン。こだまのように、あなたの歩いてきた道が返事をしてくれます。",
      "기시감은 기억의 '아는 느낌'만이 내용보다 먼저 떠오르는 현상이라고 여겨져요. 꿈은 어린 시절의 집이나 학교, 옛길을 무대로 삼기 쉽고, 그곳에는 당신의 기억의 지층이 겹쳐 있어요. '본 적 있다'는 감각은 마음이 과거의 나와 지금의 나를 다시 잇고 있다는 신호예요. 메아리처럼, 당신이 걸어온 길이 대답해 주고 있어요.",
      "既视感被认为是记忆中“熟悉的感觉”先于内容浮现的现象。梦容易把童年的家、学校、旧路当作舞台，那里叠着你记忆的地层。“好像见过”的感觉，是心在重新连接过去的自己与现在的自己。像回声一样，你走过的路在回应你。",
      "Déjà vu is thought to be the feeling of knowing arriving before the memory itself. Dreams love to stage themselves in childhood homes, schools, and old streets, where the layers of your memory overlap. The sense of having seen it before is your mind re-tying past you to present you. Like an echo, the road you have walked answers back.",
    ],
  },
  lucid: {
    basis: [
      "明晰の軸が高く、困ったときは「動く」、目が向くのは「自分の内側」（自分の意思）。「これは夢かも」と感じたら「自由に動き回る」を選ぶ人がここに来ます。",
      "자각몽 축이 높고, 곤란할 때는 '움직이며', 시선은 '내 안'(나의 의지)을 향해요. '이건 꿈일지도'라고 느끼면 '자유롭게 돌아다닌다'를 고른 사람이 여기에 와요.",
      "清醒梦轴偏高，遇到困难时选择“行动”，视线朝向“内心”（自己的意志）。感到“这可能是梦”时选择“自由行动”的人会来到这里。",
      "A high lucid scale, a style that moves, and a focus turned inward: your own will. Picking “fly, change the scene, move freely” when you sense a dream leads here.",
    ],
    story: [
      "明晰夢は、眠っている脳の中で「自分を振り返る部分」が目を覚ましている特別な状態です。夢だと気づいて飛べる人は、現実でも「今の自分を一歩引いて見て、選び直す」ことが得意。夢を織るように、あなたは自分の物語の手綱を自分で持っています。休みたい夜は手綱を緩めるのも上手さのうちです。",
      "자각몽은 잠든 뇌 속에서 '자신을 돌아보는 부분'이 깨어 있는 특별한 상태예요. 꿈인 걸 알고 날 수 있는 사람은 현실에서도 '지금의 나를 한 걸음 물러나 보고 다시 고르는' 일에 능해요. 꿈을 짜듯 당신은 자기 이야기의 고삐를 스스로 쥐고 있어요. 쉬고 싶은 밤엔 고삐를 늦추는 것도 실력이에요.",
      "清醒梦是沉睡的大脑里“反观自己的部分”醒着的特殊状态。能意识到梦并飞起来的人，在现实中也擅长“后退一步看看现在的自己，然后重新选择”。像编织梦境一样，你握着自己故事的缰绳。想休息的夜晚，学会松开缰绳也是一种本事。",
      "A lucid dream is a special state in which the self-reflecting part of the sleeping brain is awake. People who can notice a dream and fly tend to be good, in waking life too, at stepping back to look at themselves and choosing again. Like weaving a dream, you hold the reins of your own story. On nights you need rest, loosening them is a skill as well.",
    ],
  },
  aware: {
    basis: [
      "明晰の軸が高く、困ったときは「見つめる」、目が向くのは「自分の内側」。「これは夢かも」と感じても「思うように体が動かない」を選ぶ人のタイプです。",
      "자각몽 축이 높고, 곤란할 때는 '바라보며', 시선은 '내 안'을 향해요. '이건 꿈일지도'라고 느껴도 '몸이 뜻대로 움직이지 않는다'를 고른 사람의 유형이에요.",
      "清醒梦轴偏高，遇到困难时选择“静观”，视线朝向“内心”。即使感到“这可能是梦”，也选择“身体不听使唤”的人属于这一型。",
      "A high lucid scale, a style that watches, and a focus turned inward. Picking “I know it, but my body will not do what I want” when you sense a dream leads here.",
    ],
    story: [
      "「夢だとわかるのに動けない」は、気づきの部分だけが先に目覚めた、明晰夢の入り口です。研究では、気づきと操作は別々の能力で、気づきのほうが先に育つとされています。あなたはもう半分目覚めている人。夢の中で「これは夢だ」と唱えるだけでも、少しずつ手足が戻ってきます。",
      "'꿈인 줄 아는데 움직일 수 없다'는 알아차림만 먼저 깨어난, 자각몽의 입구예요. 연구에서는 알아차림과 조종이 서로 다른 능력이며, 알아차림이 먼저 자란다고 해요. 당신은 이미 반쯤 깨어 있는 사람이에요. 꿈속에서 '이건 꿈이다'라고 되뇌기만 해도 조금씩 손발이 돌아와요.",
      "“明知是梦却动不了”，是只有觉察先醒来的清醒梦入口。研究认为觉察与控制是两种不同的能力，觉察会先成长。你已经是半醒之人。哪怕只是在梦里默念“这是梦”，手脚也会一点点回来。",
      "Knowing it is a dream but being unable to move is the doorway to lucidity, where awareness has woken before control. Research treats the two as separate skills, and awareness tends to grow first. You are already half awake. Even just saying “this is a dream” inside the dream brings your limbs back, little by little.",
    ],
  },
  observer: {
    basis: [
      "明晰の軸が高く、困ったときは「見つめる」、目が向くのは「外の世界」。「これは夢かも」と感じたら「自分を外から眺める」を選ぶ人がここに来ます。どの軸も静かなときにも、ここに寄ります。",
      "자각몽 축이 높고, 곤란할 때는 '바라보며', 시선은 '바깥 세계'를 향해요. '이건 꿈일지도'라고 느끼면 '나를 밖에서 바라본다'를 고른 사람이 여기에 와요. 모든 축이 조용할 때도 이쪽으로 기울어요.",
      "清醒梦轴偏高，遇到困难时选择“静观”，视线朝向“外部世界”。感到“这可能是梦”时选择“从外面看着自己”的人会来到这里。当所有轴都很平静时，也会倾向这里。",
      "A high lucid scale, a style that watches, and a focus on the world outside. Picking “I simply watch, as if from outside” when you sense a dream leads here. When every scale is quiet, the result leans here too.",
    ],
    story: [
      "映画を観るように夢を眺める視点は、感情と少し距離を置く心の技術です。感情に飲み込まれず記憶を整理できるので、夢を覚えている人にも多いスタイル。自分を外から見られるあなたは、現実でも状況を俯瞰する役を任されがちです。ときどきはスクリーンの中に降りて、自分の番を楽しんでも大丈夫です。",
      "영화를 보듯 꿈을 바라보는 시점은 감정과 조금 거리를 두는 마음의 기술이에요. 감정에 휩쓸리지 않고 기억을 정리할 수 있어 꿈을 잘 기억하는 사람에게도 많은 스타일이에요. 자신을 밖에서 볼 수 있는 당신은 현실에서도 상황을 조망하는 역할을 맡기 쉬워요. 가끔은 스크린 안으로 내려가 자신의 차례를 즐겨도 괜찮아요.",
      "像看电影一样观看梦，是与情绪保持一点距离的心理技巧。它能在不被情绪吞没的情况下整理记忆，所以记得梦的人里也常见这种风格。能从外部看自己的你，在现实中也常被托付纵观全局的角色。偶尔走进银幕，享受属于自己的一幕也没关系。",
      "Watching a dream like a film is a skill of the mind: keeping a little distance from emotion. It lets you sort memories without being swept away, which is why many good dream recallers share this style. Someone who can see themselves from outside is often handed the role of overseer in waking life too. Now and then, step into the screen and enjoy your own scene.",
    ],
  },
  challenge: {
    basis: [
      "明晰の軸が高く、困ったときは「動く」、目が向くのは「外の世界」。「これは夢かも」と感じても「目の前の相手や課題に挑み続ける」を選ぶ人のタイプです。",
      "자각몽 축이 높고, 곤란할 때는 '움직이며', 시선은 '바깥 세계'를 향해요. '이건 꿈일지도'라고 느껴도 '눈앞의 상대나 과제에 계속 도전한다'를 고른 사람의 유형이에요.",
      "清醒梦轴偏高，遇到困难时选择“行动”，视线朝向“外部世界”。即使感到“这可能是梦”，也选择“继续挑战眼前的对手或课题”的人属于这一型。",
      "A high lucid scale, a style that moves, and a focus on the world outside. Picking “I keep taking on whatever is in front of me” when you sense a dream leads here.",
    ],
    story: [
      "戦う・試合に出る・試験に挑む夢は、脅威に「逃げる」のではなく「向かう」リハーサルです。夢の中で対処できているかどうかは回復力の目安のひとつで、挑めているあなたの心には、まだ余力があります。夢で試した一手は、翌日の現実でも意外とそのまま使えます。",
      "싸우거나 시합에 나가거나 시험에 도전하는 꿈은 위협에서 '도망치는' 것이 아니라 '맞서는' 리허설이에요. 꿈속에서 대처할 수 있는지는 회복력의 척도 중 하나이고, 도전하고 있는 당신의 마음에는 아직 여력이 있어요. 꿈에서 시험해 본 한 수는 다음 날 현실에서도 의외로 그대로 쓸 수 있어요.",
      "战斗、比赛、应考的梦，是面对威胁时“迎上去”而非“逃开”的排练。能否在梦里应对，是恢复力的指标之一，而正在挑战的你，内心仍有余力。在梦里试过的一招，第二天在现实中往往也能直接用上。",
      "Fighting, competing, and sitting exams in dreams rehearse facing a threat instead of fleeing it. Whether you can cope inside the dream is one measure of resilience, and a mind that is still taking things on has strength to spare. A move you tried in a dream often works surprisingly well the next day.",
    ],
  },
  place: {
    basis: [
      "反復の軸が高く、夢は「はっきりした場面」として残り、目が向くのは「外の世界」。繰り返すものとして「舞台になる場所」を選ぶ人がここに来ます。",
      "반복 축이 높고, 꿈은 '또렷한 장면'으로 남으며, 시선은 '바깥 세계'를 향해요. 반복되는 것으로 '무대가 되는 장소'를 고른 사람이 여기에 와요.",
      "重复轴偏高，梦以“清晰的场景”留下，视线朝向“外部世界”。在重复的事物中选择“作为舞台的地点”的人会来到这里。",
      "A high recurring scale, dreams that remain as clear scenes, and a focus on the world outside. Picking “the setting” as what repeats leads here.",
    ],
    story: [
      "実家、学校、駅、知らないはずなのに知っている街。同じ場所が舞台になるのは、そこがあなたの記憶と感情の「拠点」だから（連続性仮説）。場所は感情の入れ物で、出来事が変わっても器は同じです。さまよっているようで、あなたは毎晩、自分の地図を描き足しています。",
      "본가, 학교, 역, 모를 텐데 아는 거리. 같은 장소가 무대가 되는 건 그곳이 당신의 기억과 감정의 '거점'이기 때문이에요(연속성 가설). 장소는 감정의 그릇이라 사건이 바뀌어도 그릇은 같아요. 헤매는 듯 보여도 당신은 매일 밤 자신의 지도를 그려 나가고 있어요.",
      "老家、学校、车站、本该陌生却熟悉的街道。同一个地方成为舞台，是因为那里是你记忆与情感的“据点”（连续性假说）。地点是情绪的容器，事件变了，容器不变。看似徘徊，你其实每晚都在为自己的地图添上一笔。",
      "The family home, a school, a station, a town you should not know but do. The same place keeps returning because it is a base for your memories and feelings (the continuity hypothesis). A place is a vessel for emotion: events change, the vessel stays. You may look like a wanderer, but every night you are adding to your own map.",
    ],
  },
  person: {
    basis: [
      "反復の軸が高く、夢は「はっきりした場面」として残り、目が向くのは「自分の内側」（つながりの感覚）。繰り返すものとして「登場する人」を選ぶ人のタイプです。",
      "반복 축이 높고, 꿈은 '또렷한 장면'으로 남으며, 시선은 '내 안'(이어짐의 감각)을 향해요. 반복되는 것으로 '등장하는 사람'을 고른 사람의 유형이에요.",
      "重复轴偏高，梦以“清晰的场景”留下，视线朝向“内心”（联结的感觉）。在重复的事物中选择“出场的人”的人属于这一型。",
      "A high recurring scale, dreams that remain as clear scenes, and a focus turned inward: the sense of connection. Picking “the people” as what repeats leads here.",
    ],
    story: [
      "何度も出てくる人は、今のあなたの心を占めている関係の手がかりです。家族、昔の恋人、名前も知らない誰か。夢に出る人は本人そのものというより、あなたが「その人に向けている気持ち」の姿をしています。誰かを何度も迎え入れるあなたは、つながりを大切に抱えて歩く人です。",
      "몇 번이고 나오는 사람은 지금 당신의 마음을 차지하고 있는 관계의 단서예요. 가족, 옛 연인, 이름도 모르는 누군가. 꿈에 나오는 사람은 그 사람 자체라기보다 당신이 '그 사람에게 향하는 마음'의 모습을 하고 있어요. 누군가를 몇 번이고 맞이하는 당신은 이어짐을 소중히 안고 걷는 사람이에요.",
      "反复出现的人，是当下占据你内心的关系线索。家人、旧情人、不知名的某人。梦里的人与其说是本人，不如说是你“对那个人的心情”所化的模样。一次次迎接某人的你，是把联结珍藏在怀里前行的人。",
      "A person who keeps returning is a clue to the relationship that occupies your mind right now. Family, an old love, someone whose name you never learned. The people in dreams are less themselves than the shape of the feelings you hold toward them. Someone who welcomes another again and again walks with connection held close.",
    ],
  },
  story: {
    basis: [
      "反復の軸が高く、夢は「雰囲気・気配」（流れ）として残り、目が向くのは「外の世界」（出来事）。繰り返すものとして「ストーリーの流れや結末」を選ぶ人がここに来ます。",
      "반복 축이 높고, 꿈은 '분위기·기운'(흐름)으로 남으며, 시선은 '바깥 세계'(사건)를 향해요. 반복되는 것으로 '이야기의 흐름이나 결말'을 고른 사람이 여기에 와요.",
      "重复轴偏高，梦以“氛围·气息”（流向）留下，视线朝向“外部世界”（事件）。在重复的事物中选择“故事的走向或结局”的人会来到这里。",
      "A high recurring scale, dreams that remain as a flow rather than a snapshot, and a focus on the world outside: events. Picking “the way the story unfolds or ends” as what repeats leads here.",
    ],
    story: [
      "遅刻する、試験に間に合わない、同じ結末にたどり着く。同じ展開が続くのは、心がまだ「別の結末」を探している途中だからです。情動処理の研究では、繰り返す夢の結末が少しずつ変わっていくことが、回復のサインとされています。語り手であるあなたは、続きを書き換える権利を持っています。",
      "지각하고, 시험에 늦고, 같은 결말에 다다르는 것. 같은 전개가 이어지는 건 마음이 아직 '다른 결말'을 찾는 중이기 때문이에요. 정서 처리 연구에서는 반복되는 꿈의 결말이 조금씩 바뀌어 가는 것을 회복의 신호로 봐요. 이야기꾼인 당신은 다음 장을 고쳐 쓸 권리를 갖고 있어요.",
      "迟到、赶不上考试、走向同样的结局。同样的情节不断上演，是因为心还在寻找“另一种结局”。情绪加工研究认为，反复的梦的结局逐渐改变，是恢复的信号。作为讲述者的你，拥有改写续集的权利。",
      "Running late, missing the exam, arriving at the same ending. The same plot keeps playing because your mind is still looking for a different ending. Emotion-processing research treats a recurring dream whose ending slowly changes as a sign of recovery. As the storyteller, you hold the right to rewrite what comes next.",
    ],
  },
  emotion: {
    basis: [
      "反復の軸が高く、夢は「雰囲気・気配」として残り、目が向くのは「自分の内側」。繰り返すものとして「目覚めたときの気持ち」を選ぶ人のタイプです。",
      "반복 축이 높고, 꿈은 '분위기·기운'으로 남으며, 시선은 '내 안'을 향해요. 반복되는 것으로 '깨어났을 때의 기분'을 고른 사람의 유형이에요.",
      "重复轴偏高，梦以“氛围·气息”留下，视线朝向“内心”。在重复的事物中选择“醒来时的心情”的人属于这一型。",
      "A high recurring scale, dreams that remain as a mood, and a focus turned inward. Picking “the feeling I wake up with” as what repeats leads here.",
    ],
    story: [
      "内容は毎回違うのに、目覚めた気持ちがいつも同じ。夢は出来事より「感情」でつながっているので、これは心の基調音が聞こえているサインです。夢の感情は翌日の気分と影響し合うことがわかっています。共鳴するあなたは、自分の気持ちの温度をいちばん正確に測れる人。朝の気持ちをひとこと記録するだけで、基調音は少しずつ変えていけます。",
      "내용은 매번 다른데 깨어난 기분은 늘 같은 것. 꿈은 사건보다 '감정'으로 이어져 있어서, 이건 마음의 기조음이 들리고 있다는 신호예요. 꿈의 감정은 다음 날 기분과 서로 영향을 주고받는다고 알려져 있어요. 공명하는 당신은 자기 마음의 온도를 가장 정확히 잴 수 있는 사람이에요. 아침의 기분을 한마디만 기록해도 기조음은 조금씩 바꿔 갈 수 있어요.",
      "内容每次不同，醒来的心情却总是一样。梦是靠“情绪”而非事件串联的，所以这是你听见了内心基调音的信号。研究表明梦的情绪与第二天的心情相互影响。会共鸣的你，是最能准确测量自己心情温度的人。哪怕只记录一句早晨的心情，基调音也会慢慢改变。",
      "The content changes every time, but the feeling on waking is always the same. Dreams are linked by emotion more than by events, so this is the sound of your mind's keynote. Dream emotion and next-day mood are known to shape each other. Someone who resonates like this can read their own emotional temperature most accurately. Noting the morning feeling in a single line is enough to shift the keynote, little by little.",
    ],
  },
};
