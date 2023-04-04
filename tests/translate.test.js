import test from 'ava';
import { getTestServer, initTypeDefsResolvers } from './main.test.js';

let testServer;

test.before(async () => {
  await initTypeDefsResolvers();
  testServer = getTestServer();
});

test.after.always(async () => {
    await testServer.stop();
});

test('test translate endpoint with huge arabic text english translation and check return non-arabic/english', async t => {
    const response = await testServer.executeOperation({
        query: 'query translate($text: String!, $to:String) { translate(text: $text, to:$to) { result } }',
        variables: {
            to: 'English',
            text: `
طهران- ما عدا فترات قصيرة ساد خلالها الهدوء في علاقات إيران الخارجية، فإن ملفات طهران حافظت على سخونتها منذ الثورة الإيرانية عام 1979 حتی اليوم، فما إن تهدأ قضية حتى تعود أخرى إلى الواجهة على هيئة احتجاج في الداخل أو توتر في علاقات طهران مع دول إقليمية أو غربية.

ومع الاحتجاجات التي انطلقت شرارتها إثر وفاة الشابة مهسا أميني في منتصف أيلول/سبتمبر الماضي، عاد التوتر إلى العلاقات الإيرانية الأوروبية من جديد، مما أبرز علامات استفهام كبيرة عن سبب تكرار الاحتجاجات، ومستقبل المفاوضات النووية، وعلاقات طهران مع دول الجوار، وعما إذا كانت ستغيّر موقفها من القضية الفلسطينية.

وفي حوار خاص للجزيرة نت مع السياسي الإيراني المحافظ محمد رضا باهنر، عضو مجمع تشخيص مصلحة النظام والأمين العام للجمعية الإسلامية للمهندسين، الذي سبق أن حافظ علی معقده في البرلمان الإيراني طوال 28 عاما؛ استبعد أن تكون قضية وفاة الشابة مهسا أميني هي السبب الرئيسي للاحتجاجات، بل علق الأمر على التدخلات الخارجية التي سعت إلى التجييش ضد النظام الإيراني.

وفيما يأتي نص الحوار:

باهنر أقرّ بوجود أخطاء وتقصير في عمل المؤسسات الإيرانية لكن السلطة القضائية والأجهزة الرقابية تحاول علاجها (الجزيرة)

شهدت الساحة الإيرانية خلال الأشهر الأخيرة احتجاجات شعبية واسعة، لكنها ليست الوحيدة خلال العقود الماضية. برأيك ما أسباب تكرار الاحتجاجات في إيران؟

خلافا للمناورات الإعلامية التي تحاول تقديم موضوع الحجاب ووفاة الشابة مهسا أميني علی أنه السبب الأساس لانطلاقة هذه الاحتجاجات، فإنني أرى أن التطورات في الداخل الإيراني مرتبطة ارتباطا وثيقا بالمستجدات الدولية والتهديدات الموجهة للجمهورية الإسلامية منذ عام 1979. لكن هذه المرة كانت الحرب الناعمة ضدنا شاملة وهجينة على مختلف الجبهات الداخلية والخارجية.

هناك تحليلات متفاوتة عن سبب خوض العدو غمار المعركة الشاملة ضد إيران في المرحلة الراهنة، بين من يرى أن الأخيرة تعيش مرحلة الضعف وفقدت قاعدتها الاجتماعية جراء تردي الوضع المعيشي وفاعلية العقوبات الخارجية، في حين يرى آخرون أن فتح جبهة محدّدة ضد إيران أثبت فشله، حيث استطاعت طهران خلال العقود الماضية لملمة جراحها وتجاوز العديد من الأزمات، وبالتالي لا بد من فتح عدة جبهات ضدها في آن واحد.

أما الفئة أخرى، فإنها تؤمن بضرورة النيل من إيران في أي وقت وبشتى الأدوات وأينما سنحت الفرصة لوضع حد لتطورها المتنامي، وهذا تحليل ضعيف جدا. في الوقت ذاته، هناك من يعتبر السياسات الإيرانية هجومية ويخشى تداعياتها على الصعيدين الإقليمي والدولي، وهذا ما أدى إلى تقاطع مصالح العديد من الجهات بشأن الملف الإيراني والتخويف من سياسات طهران؛ مما أدى بأطراف خارجية أن تشن حربا هجينة ضد إيران في المرحلة الراهنة، انطلاقا من تقارير مفبركة كانت قد تلقتها عن تدهور الحالة الصحية للمرشد الأعلى آية الله علي خامنئي، في حين أن العدو كان قد خطط لإطلاق عملياته في الفترة المقبلة، وأن وفاة الشابة مهسا أميني ليست سوى ذريعة لإطلاق شرارة العمليات المعدة مسبقا ضدنا.

هذا عن دور الجانب الخارجي في الاحتجاجات، لكن ماذا عن العوامل الداخلية؟

لم ندّعِ يوما أن سلوك المؤسسات الإيرانية وكوادرها لا يعتريه التقصير والقصور، بل هنالك أخطاء ومشكلات دون أدنى شك. في المقابل تعمل السلطة القضائية والأجهزة الرقابية بعزيمة عالية على معاقبة المقصّرين وجبر خواطر الضحايا وذويهم قدر المستطاع، لكن هذا لا يبرر فبركة شتى أنواع الاتهامات بحق الدولة والتآمر ضدها.

نعتقد أنه كان بالإمكان تفادي جزء من الغضب الشعبي الناجم عن عمليات الحرب الناعمة، من خلال الإسراع في تشكيل لجنة تقصي حقائق والإعلان عن سبب وفاة الشابة مهسا أميني ومعاقبة المقصّرين المحتملين.

قبل شهرين من قضية مهسا، كان المجلس الأعلى للثورة الثقافية قد عمّم قرارا يؤكد ضرورة وقف العنف والاستعانة بالشرطة الأخلاقية (دوريات الإرشاد) في تطبيق قانون الحجاب، والتركيز على جانب الأمر بالمعروف والنهي عن المنكر. ومما لا شك فيه، فإن عدم أخذ القرار على محمل الجد نجم عن غفلة بعض الجهات الإيرانية، مما كلف البلاد غاليا خلال فترة الاحتجاجات، كما أننا لا ننكر تردي الوضع الاقتصادي والمعيشي ودوره في اعتراض شريحة من أبناء الشعب الإيراني، لكن هنا لا بد من التفريق بين الحراك المطلبي وأعمال الشغب.

نعتقد أن أقل من 3% من الشعب الإيراني قاموا بصب الزيت على النار خلال التطورات الأخيرة. وفي المقابل، هناك غالبية أعلنت ولاءها للنظام الإسلامي من خلال المشاركة في المسيرات الداعمة للجمهورية الإسلامية.

لا نريد التقليل من نسبة المعاندين والمعارضين للنظام الإيراني، بل نعتقد أن هذه النسبة كبيرة، ويتعيّن علينا فتح قنوات اتصال وحوار معهم، لتحويل المعاند إلى معارض وتبديل المعارض إلى محايد، واستقطاب المحايد وتحويله إلى موالٍ. للأسف نسمع بعض الأصوات المتطرفة في الداخل الإيراني تعمل على طرد كل الذين لا ينتمون إلى معسكر الموالين للنظام.

هل هناك آلية بالفعل للمصالحة بين النظام الإيراني والمحتجين؟

بعد الاحتجاجات الأخيرة التي شهدتها البلاد، قدمت خطة إلى السلطات المعنية، سبق أن تم إعدادها بناء على دراسات علمية، من أجل تقريب وجهات النظر وتكريس ثقافة الحوار بين شرائح الشعب الإيراني. نعتقد أننا ابتعدنا قليلا عن الثقافة التي كانت تشجع على حرية التعبير عقب الثورة الإيرانية عام 1979. ويمكن تلخيص محاور الخطة الرئيسية كالتالي:

إطلاق كرسي الحوار في الجامعات الإيرانية، وتوفير أماكن للاعتراض والاحتجاج، والاعتراف بحق مختلف الأطياف السياسية والاجتماعية في المشاركة بالحكم، وتوفير الأرضية للمنافسة السليمة بينها، وتعديل الأخطاء الموجودة في منظومة الحكم.

وقد تجاوب كل من الرئيس إبراهيم رئيسي ورئيس السلطة القضائية مع هذه الخطة، وهناك جلسات عقدت وتعقد من أجل تعديلها ورسم خارطة طريق لتطبيقها في الفترة المقبلة، وسوف نتابع تنفيذها من خلال مجمع تشخيص مصلحة النظام.

نسمع منذ فترة أصواتا تنادي بتعديل الدستور الإيراني وإجراء استفتاء عام لإخراج البلاد من الأزمات، هل تتابعون هذه المطالب في إطار الخطة التي تقدمتم بها؟

موضوع الاستفتاء بشأن نوعية النظام السياسي في البلاد أصبح في خبر كان، لأنه تم إجراء هذا الاستفتاء عقب الثورة الإيرانية وصوتت غالبية الشعب الإيراني لصالح الجمهورية الإسلامية، ولا توجد مثل هذه البدعة التي يطالب بها البعض في أي من الدول الأخرى.

أما بخصوص تعديل بعض المواد القانونية في الدستور الإيراني، فإنه لا يمانع أحد مثل هذا التوجه المنصوص عليه في المادة 177 من الدستور نفسه، ما عدا المواد القانونية التي تتضمن جمهورية النظام وإسلاميته. لكن هل نعتزم تعديل بعض مواد الدستور خلال الفترة القصيرة المقبلة؟ إن الجواب بالنفي، وذلك بالرغم من أننا نشاطر الأصوات التي تطالب بتعديل الدستور، لأن هذه المطالب كبيرة ومتضاربة في بعض الأحيان وتشمل طيفا موسعا من المواد الدستورية. نؤمن بضرورة تعديل الدستور، لكن لا بد من إجماع الأوساط الفكرية على المواد المراد تعديلها، وحينها سيكون إجراء الاستفتاء على المواد المعدلة لازما.

ووفق المادة 177 من الدستور الإيراني، تتم المراجعة بأمر من المرشد الأعلى إلى الرئيس، وذلك بعد التشاور مع مجمع تشخيص مصلحة النظام، لإعادة النظر في المواد التي يلزم تعديلها أو إضافتها من قبل مجلس يتألف من:

أعضاء مجلس صيانة الدستور.

رؤساء السلطات الثلاث.

الأعضاء الدائمين في مجمع تشخيص مصلحة النظام.

5 من أعضاء مجلس خبراء القيادة.

10 أشخاص يعيّنهم المرشد.

3 من المجلس الوزاري.

3 من السلطة القضائية.

10 من نواب البرلمان.

3 أكاديميين.

وتطرح قرارات هذا المجلس على الاستفتاء العام بعد توقيعها من قبل المرشد، وتصبح سارية المفعول في حال حازت على موافقة الأكثرية المطلقة من المشاركين في الاستفتاء.

أحد أسباب تردي الوضع الاقتصادي الناتج عن العقوبات المالية يعود إلى عدم موافقة طهران على اتفاقيات "فاتف" (FATF) المتعلقة بمكافحة غسيل الأموال وتمويل الإرهاب، لماذا لم تحسم هذه القضية حتى الآن؟

لدينا خلاف بين البرلمان ومجلس صيانة الدستور بشأن قوانين مجموعة العمل المالي، مما أدى إلى إحالة القضية إلى مجمع تشخيص مصلحة النظام الذي لم يحسم بدوره الأمر لأسباب مختلفة منها تضارب آراء أعضائه، وهناك قانون ينص على أنه في حال عدم بت المجمع في قضية ما خلال عام من إحالتها إليه، فإن القرار سيكون لصالح مجلس صيانة الدستور الذي يعارض المصادقة على قوانين فاتف في هذه القضية.

أود أن أقول هنا إن رأي الحكومة مؤثر في إقناع الأعضاء في مجمع مصلحة النظام، وإذا كانت حكومة إبراهيم رئيسي ترى مصلحة في المصادقة على هذه القوانين فيمكنها الإدلاء برأيها ومطالبة المجمع بالبت من جديد في القضية، وحينها سنكون في المجمع على استعداد لتسهيل الأمر في هذا الملف.

أشرت أكثر من مرة إلى دور سلبي تلعبه جهات أجنبية ضد طهران بما في ذلك في الاحتجاجات الأخيرة، ما سبب هذا العداء الخارجي للنظام الإيراني؟

منذ حقبة الرئيس الأسبق محمود أحمدي نجاد، وطرحه موضوع محرقة الهولوكوست وصدور قرارات أممية ضد إيران، بدأ المجتمع الدولي باتهام طهران بتبني سياسة هجومية، مما مهّد الطريق لعمل بعض الجهات على التخويف من إيران، في ظل غفلة الأخيرة من مخاطر هذا التوجه الدولي وعدم التحرك الجاد لإبطال مفعول الدعاية المضللة التي يقوم بها العدو.

لقد وجد العدو في بعض الملفات الإيرانية -مثل برنامجها النووي وقدراتها العسكرية- ذريعة للضغط على طهران، ولمطالبتها بالتخلي عن مرتكزات قوتها، بينما هذه البرامج ردعية وتهدف إلى ضمان المصالح الوطنية، ولولا القدرات التي توصل إليها الإيرانيون خلال العقود الماضية لتمت مهاجمة الجمهورية الإسلامية حتى الآن.

ألا تظنون أن البرنامج النووي كلف البلاد أكثر من طاقاتها؟

العالم الغربي ينتهج سياسة مزدوجة حيال البرنامج النووي الإيراني، إذ يغض البصر عن البرنامج النووي الإسرائيلي ويبذل ما في وسعه للضغط على إيران، بالرغم من إصدار المرجعية الدينية في إيران فتوى تحرّم تصنيع وحيازة السلاح النووي، ناهيك عن أن الدول الدائمة العضوية في مجلس الأمن الدولي تمتلك أسلحة نووية، لكنها تعارض تطوير الدول الأخرى طاقاتها النووية بذريعة الحد من انتشار أسلحة الدمار الشامل.

هناك استخدامات عديدة للطاقة النووية وتقنياتها، أبرزها في المجالات الطبية والدواء والكهرباء والزراعة؛ والجانب العسكري ليس سوى أحد هذه المجالات. أعداء إيران يريدون حرمانها من كل هذه الاستخدامات السلمية، لأن هناك آليات بالفعل لمنع الدول من بلوغ العتبة النووية والتحرك نحو تصنيع أسلحة نووية، وقد تم الاتفاق بين إيران والمجموعة السداسية عام 2015 علی إطالة أمد بلوغ طهران العتبة النووية في إطار الاتفاق النووي، لكن الولايات المتحدة هي التي انتهكت الاتفاق وانسحبت منه عام 2018 وأعادت العقوبات الأحادية على إيران.

ورغم تعنت الجانب الغربي في المفاوضات النووية طوال العامين الماضيين، فإن طهران على استعداد لاستئناف المفاوضات الرامية لإحياء الاتفاق النووي، لكننا بحاجة إلى ضمانات بشأن وفاء الطرف المقابل بتعهداته.

هناك اتهامات متكررة بشأن تدخل إيران في الشؤون الداخلية للدول العربية، كيف تعلقون على ذلك؟

الوثيقة العشرينية الموسومة بـ"إيران في أفق 2025″ التي صدرت عام 2003، تؤكد بوضوح على ضرورة تعاون طهران مع جميع دول العالم ما عدا الكيان الصهيوني الذي لم تعترف به الجمهورية الإسلامية، ومنذ ذلك الحين لم نغيّر في سياساتنا، ولا سيما تجاه الدول الجوار، لكن روّج العدو لمقولة تصدير الثورة الإسلامية للخارج، ودق الإسفين بيننا وبين الدول الإسلامية، في حين أن المقصود من تصدير الثورة هو تبيين مبادئها وثقافتها الإسلامية، بعيدا عن كل الشائعات الرامية إلى التخويف من الجمهورية الإسلامية بسبب موقفها المبدئي تجاه الكيان الصهيوني. لعل أبرز نقطة خلافية بين طهران والولايات المتحدة هي موقف الجمهورية الإسلامية من الكيان الصهيوني.

ولا ننكر أن ما وصلت إليه العلاقات الإيرانية العربية خلال السنوات الماضية كان نابعا عن غفلتنا إزاء مخططات أعداء الأمة الإسلامية، في حين أن المصالح والقواسم المشتركة بين الشعب الإيراني والشعوب العربية والإسلامية أكبر بكثير من النقاط الخلافية بينهما، ونستغل هذه المقابلة لندعو هنا إلى حوار عادل لوضع حدّ لهذه الاتهامات وإحلال الوفاق والوئام في المنطقة.

الشعب الإيراني دفع ضريبة رفع الجمهورية الإسلامية شعار القضاء على إسرائيل، ألا تزال إيران متحمسة لهذا الشعار؟

لقد أكد مؤسس الجمهورية الإسلامية آية الله الخميني مرارا أن الثورة الإسلامية ترتبط ارتباطا وثيقا بالقضية الفلسطينية، ولا يمكن تفكيكهما، ولا تغيير بعد في موقف طهران الثابت حيال تحرير القدس مهما عظمت الضريبة التي ندفعها.

نحن أعلنّا أنه يجب إزالة الكيان الصهيوني، لكننا لم نعلن يوما أننا نريد الهجوم عسكريا للقضاء عليه، لكن مما لا شك فيه أننا سندعم حلفاءنا في أي مواجهة مع الكيان الصهيوني، في حين أن الولايات المتحدة تعلن باستمرار أنها تريد تغيير النظام في إيران بسبب سياساتها المناوئة للكيان الصهيوني، لكنها تعرف جيدا أن طهران لن تقف مكتوفة الأيدي تجاه أي اعتداء على مصالحها، وفي نهاية المطاف تقديرنا أن الاحتلال الإسرائيلي لن يستمر في الأراضي الفلسطينية، وأن أولى القبلتين سوف تتحرر ولو بعد حين.
` },
    });

    t.falsy(response.errors);
    t.true(response.data?.translate.result.length > 1000); // check return length huge
    // check return only contains non-Arabic characters
    t.notRegex(response.data?.translate.result, /[ء-ي]/);
});

