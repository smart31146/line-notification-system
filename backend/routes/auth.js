const router = require('express').Router();
let User = require('../models/user.model');
const subUser = require('../models/subuserModel.js');
let LoginUser = require('../models/Loginuser.model');
const { registrationValidation, loginValidation } = require('../validations');
const bcrypt = require('bcryptjs');

//jsonwebtoken is provided when the user logged in and
// is used to know if the user is logged in or not.
const jwt = require('jsonwebtoken');

//Registratoin
router.post('/register', async (req, res) => {
  //LETS VALIDATE THE DATA BEFORE WE MAKE A USER
  const { error } = registrationValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  //CHECKING IF THE USER ALREADY EXISTS IN THE DATABASE
  const emailExists = await User.findOne({ email: req.body.email });
  if (emailExists) return res.status(400).send('メールは既に登録済みです!');
 
  //GENERATING HASH PASSWORD
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(req.body.password, salt);

  //CREATING NEW USER
  const newUser = await new User({
    name: req.body.name,
    email: req.body.email,
    password: hashedPassword,
  });
  const newLoginuser = await new LoginUser({
    email: req.body.email,
    loginStatus: 0,
  });
  try {
    // const savedUser =
    await newUser.save();
    await newLoginuser.save();
    res.send({ user: newUser.name });
  } catch (err) {
    res.status(400).send(err);
  }
});

//LOGIN
router.post('/login', async (req, res) => {
  //LOGIN VALIDATION
  const { error } = loginValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  //CHECKING IF USER ALREADY EXISTS OR NOT
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(400).send('ユーザーが登録されていません!');

  //CHECKING IF PASSWORD IS CORRECT FOR THAT USER OR NOT by comparing the entered passwrord with the hashpassword genreated by bcrypt
  const validPassword = await bcrypt.compare(req.body.password, user.password);
  if (!validPassword) return res.status(400).send('パスワードを正確に入力してください!');

  const subuser = await subUser.findOne({email: req.body.email });
  const cur_day = new Date();
  if(subuser === null) {
    return res.status(400).send('購入されていないか、使用期限が切れています。');
  }
  console.log(subuser.endDate, cur_day);

  //CREATING TOKEN
  //token is send with a parameter(for now: id is send) that can be accessed in the frontend
  //along with a secret token value stored in dotenv
  const userStatus = await LoginUser.findOne({email: req.body.email});
  if(userStatus.loginStatus === 1) {
    return res.status(400).send('複数のデバイスで利用できません。'); 
  }

  if(subuser && subuser.endDate > cur_day) {
    userStatus.loginStatus = 1;
    await userStatus.save();
    const token = jwt.sign({ _id: user._id }, process.env.SECRET_TOKEN, {
    expiresIn: '30d',});
  
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development', // Use secure cookies in production
      sameSite: 'strict', // Prevent CSRF attacks
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    
    res.header('auth-token', token).send({ token, user: user.name, email: req.body.email });
  }
  else {
    return res.status(400).send('購入されていないか、使用期限が切れています。');
  }
});

router.post('/logout', async (req, res) => {
  //CREATING TOKEN
  //token is send with a parameter(for now: id is send) that can be accessed in the frontend
  //along with a secret token value stored in dotenv
  const userStatus = await LoginUser.findOne({email: req.body.email});
  userStatus.loginStatus = 0;
  await userStatus.save();
  res.status(200).send("ログアウトしました。");
});




const lineNotify = require('line-notify-nodejs');
const puppeteer = require("puppeteer");

const Product = require('../models/productModel.js');
const YahProduct = require('../models/YahproductModel.js');

router.post('/mercari', async (req, res) => {

  try {
    let email = req.body.email;
    const end = await subUser.findOne({email});
    const cur_day = new Date();

    console.log(end.endDate, cur_day);

    if(end.endDate === null || end.endDate === undefined || end.endDate === "null" || end.endDate < cur_day) {
      res.json("expired");
      return ;
    }
  } catch (error) {
    console.log("error in endDate");
  }

  let lineToken = req.body.token;
  let data = req.body.Data;
try{

  const browser = await puppeteer.launch({
    "headless": true,
    "args": ["--fast-start", "--disable-extensions", "--no-sandbox","--lang=ja-JP,ja"],
    "ignoreHTTPSErrors": true
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 
    'Accept-Language': 'ja' 
  });
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  const firstNotify_pros = [];
  const firstNotify_pro_url = [];
  const firstNotify_pro_image = [];
  const firstNotify_pro_price = [];
  const firstNotify_pro_title = [];
  let firstNotify_cnt = 0;

  let name_rlt = [];
  let price_rlt = [];
  let products_url = [];
  let image_url = [];
  let flag = 0;
  console.log("OK",data.length);
  for(let i = 0 ; i < data.length; i++) {
    let part = data[i];
    let notifyTitle = part.Title;
    let targetURL;
    if(part.category === "0") targetURL = "https://jp.mercari.com/search?keyword=" + part.keyword + 
    "&price_max=" + part.maxprice + "&status=on_sale"+ 
    "&price_min=" +part.minprice + "&exclude_keyword=" + part.expkeyword + "&item_condition_id=" + part.status;

    else targetURL = "https://jp.mercari.com/search?keyword=" + part.keyword + 
    "&price_max=" + part.maxprice + "&status=on_sale&category_id=" + part.category+ 
    "&price_min=" +part.minprice + "&exclude_keyword=" + part.expkeyword + "&item_condition_id=" + part.status;

    try {
      while(1) { 
        try {
          await page.goto(targetURL);
          break;
        } catch (error) {
          console.log("error in url");
        }
      }       
      const len = name_rlt.length;   
      const price_len = price_rlt.length; 
      const url_len = products_url.length;   
      const imageurl_len = image_url.length;  
      const user_email = req.body.email;
      const no = i; 
      const preProducts = await Product.findOne({user_email, no});
      console.log(req.body.email);
      
      let products;   
      let products_price;
      let url;    
      let imageurl;  
      let flg = 0;
      while(flg < 100) {   
        try {flg++;
          products =  await page.$$eval('.itemName__a6f874a2', elements=> elements.map(item=>item.textContent));
    
          console.log("select1");
          products_price =  await page.$$eval('.number__6b270ca7', elements=> elements.map(item=>item.textContent));
      
          console.log("select2");
          url = await page.$$eval('[data-testid="thumbnail-link"]', anchors => [].map.call(anchors, a => a.href));

          console.log("select3");
          imageurl = await page.$$eval("picture > img", anchors => [].map.call(anchors, img => img.src));

          if(products.length === 0 || products_price.length === 0 || url.length === 0 || imageurl.length === 0) continue;
          break;   
        } catch(error) {
          console.log(error);
        }
      }

      if(url.length === 0) continue;
 
      if(preProducts) {
          if(req.body.flag === 0) {

            preProducts.pro_URL = JSON.stringify(url);
            preProducts.last_URL = url[0];
            // console.log(url);
            await preProducts.save();
            console.log(i, "success!", products.length);

            for(let j = 0 ; j < Math.min(products.length, 10); j++) {
              name_rlt[j + len] = products[j];
              price_rlt[j + price_len] = products_price[j];
              products_url[j + url_len] = url[j];
              image_url[j + imageurl_len] = imageurl[j];
            }

            for(let j = 0 ; j < Math.min(products.length, 10); j++) {
              firstNotify_pros[firstNotify_cnt] = products[j];
              firstNotify_pro_url[firstNotify_cnt] = url[j];
              firstNotify_pro_image[firstNotify_cnt] = imageurl[j];
              firstNotify_pro_price[firstNotify_cnt] = products_price[j];
              firstNotify_pro_title[firstNotify_cnt++] = notifyTitle;
            }
          }

          else {
            const L = url.length;
            console.log(url.length);
            let j;
            const pre_url = JSON.parse(preProducts.pro_URL);
            for(j = 0 ; j < L; j++) {
              name_rlt[j + len] = products[j];
              price_rlt[j + price_len] = products_price[j];
              products_url[j + url_len] = url[j];
              image_url[j + imageurl_len] = imageurl[j];

              if(pre_url[0] === url[j] || pre_url[1] === url[j] || pre_url[2] === url[j] ||
                pre_url[3] === url[j]) {
                // for(let k = j + 1 ; k < Math.min(j + 10, L); k++) {
                //   name_rlt[k + len] = products[k];
                //   price_rlt[k + price_len] = products_price[k];
                //   products_url[k + url_len] = url[k];
                //   image_url[k + imageurl_len] = imageurl[k];
                // }
                
                let k;
                for(k = 0 ; k < j; k++) {
                  if(url[k] === preProducts.last_URL || lineToken === "") break;
                  
                  lineNotify(lineToken).notify({
                    message: notifyTitle + "    価格 " + products_price[k] + "円 " + products[k]+ " " + url[k],
                    data: {
                      imageFullsize: imageurl[k].split("?")[0]
                    }
                  }).then(() => {
                    console.log('send completed!');
                  }).catch((error) => {
                    console.log("line error");
                    flag = 1;
                    return ;
                  });
                }
                preProducts.last_URL = url[0];
                await preProducts.save();
                break;
              }
            }

            if(j === L) {
              preProducts.pro_URL = JSON.stringify(url);
              preProducts.last_URL = url[0];
              await preProducts.save();
            }
          }
      }

      else {
        //console.log(pro_URL);
        const pro_URL = JSON.stringify(url);
        const last_URL = url[0];
        console.log(no);
        console.log(user_email);
        console.log(pro_URL);
        console.log(last_URL);

        await Product.create({
          user_email,
          no,
          pro_URL,
          last_URL
        });
        

        for(let j = 0 ; j < Math.min(products.length, 10); j++) {
          name_rlt[j + len] = products[j];
          price_rlt[j + price_len] = products_price[j];
          products_url[j + url_len] = url[j];
          image_url[j + imageurl_len] = imageurl[j];
        }

        for(let j = 0 ; j < Math.min(products.length, 10); j++) {
          firstNotify_pros[firstNotify_cnt] = products[j];
          firstNotify_pro_url[firstNotify_cnt] = url[j];
          firstNotify_pro_image[firstNotify_cnt] = imageurl[j];
          firstNotify_pro_price[firstNotify_cnt] = products_price[j];
          firstNotify_pro_title[firstNotify_cnt++] = notifyTitle;
        }  
      }
    } 
    catch(error) {   
      console.log("error in ");
    }
  }
 
  // if(req.body.flag === 0 && lineToken !== "") {
    
  //   for(let i = 0 ; i < firstNotify_cnt; i++) {
  //     lineNotify(lineToken).notify({
  //       message: firstNotify_pro_title[i] + "    価格 " + firstNotify_pro_price[i] + "円 " + firstNotify_pros[i]+ " " + firstNotify_pro_url[i],
  //       data: {
  //         imageFullsize: firstNotify_pro_image[i].split("?")[0]
  //       }
  //     }).then(() => {
  //       console.log('send completed!');
  //     }).catch((error) => {
  //       console.log("line error");
  //       flag = 1;
  //       return ;
  //     });
  //   }
  // }
  
  if(req.body.flag === 0) {
    name_rlt = [];
    price_rlt = [];
    products_url = [];
    image_url = [];
  }

  await browser.close();
  console.log("browser closed");
  let sendData = {
    product_names: name_rlt,
    product_prices: price_rlt, 
    product_urls: products_url,
    image_urls: image_url, 
    flag: flag
  };
  
  res.json(sendData);
} catch(error) {
  console.log("error");
}
});

router.post('/yahoo', async (req, res) => {

  try {
    let email = req.body.email;
    const end = await subUser.findOne({email});
    const cur_day = new Date();

    console.log(end.endDate, cur_day);

    if(end.endDate === null || end.endDate === undefined || end.endDate === "null" || end.endDate < cur_day) {
      res.json("expired");
      return ;
    }
  } catch (error) {
    console.log("error in endDate");
  }

  let lineToken = req.body.token;
  let data = req.body.Data;
try{

  const browser = await puppeteer.launch({
    "headless": true,
    "args": ["--fast-start", "--disable-extensions", "--no-sandbox","--lang=ja-JP,ja"],
    "ignoreHTTPSErrors": true
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 
    'Accept-Language': 'ja' 
  });
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  const firstNotify_pros = [];
  const firstNotify_pro_url = [];
  const firstNotify_pro_image = [];
  const firstNotify_pro_price = [];
  const firstNotify_pro_title = [];
  let firstNotify_cnt = 0;

  let name_rlt = [];
  let price_rlt = [];
  let products_url = [];
  let image_url = [];
  let flag = 0;
  console.log("OK",data.length);
  for(let i = 0 ; i < data.length; i++) {
    let part = data[i];
    let notifyTitle = part.Title;

    let targetURL;

    if(part.category === "0") targetURL = "https://auctions.yahoo.co.jp/search/search?p="+part.keyword+"&va="+part.keyword+"&aucminprice="+part.minprice+"&aucmaxprice="+part.maxprice+"&price_type=currentprice&min="+part.minprice+"&max="+part.maxprice+"&istatus="+part.status+"&is_postage_mode=1&dest_pref_code=13&exflg=1&b=1&n=100&s1=new&o1=d";
    else targetURL =  "https://auctions.yahoo.co.jp/search/search?p="+part.keyword+"&auccat=" +part.category+ "&va="+part.keyword+"&aucminprice="+part.minprice+"&aucmaxprice="+part.maxprice+"&price_type=currentprice&min="+part.minprice+"&max="+part.maxprice+"&istatus="+part.status+"&is_postage_mode=1&dest_pref_code=13&exflg=1&b=1&n=100&s1=new&o1=d";

    // console.log(part);
    try {
      while(1) { 
        try {

          await page.goto(targetURL);
          break;
        } catch (error) {
          console.log("error in url");
        }
      }       
      const len = name_rlt.length;   
      const price_len = price_rlt.length; 
      const url_len = products_url.length;   
      const imageurl_len = image_url.length;  
      const user_email = req.body.email;
      const no = i; 
      const preProducts = await YahProduct.findOne({user_email, no});
      console.log(req.body.email);
      
      let products;   
      let products_price;
      let url;    
      let imageurl;  
      let flg = 0;
      while(flg < 100) {   
        try {flg++;
          products =  await page.$$eval('.Product__titleLink', elements=> elements.map(item=>item.textContent));
    
          console.log("select1");
          products_price =  await page.$$eval('.u-textRed', elements=> elements.map(item=>item.textContent));
      
          console.log("select2");
          url = await page.$$eval('.Product__imageLink', anchors => [].map.call(anchors, a => a.href));

          console.log("select3");
          imageurl = await page.$$eval(".Product__imageData", anchors => [].map.call(anchors, img => img.src));

          if(products.length === 0 || products_price.length === 0 || url.length === 0 || imageurl.length === 0) continue;
          break;   
        } catch(error) {
          console.log(error);
        }
      }

      if(url.length === 0) continue;
 
      if(preProducts) {
          if(req.body.flag === 0) {

            preProducts.pro_URL = JSON.stringify(url);
            preProducts.last_URL = url[0];
            // console.log(url);
            await preProducts.save();
            console.log(i, "success!", products.length);

            for(let j = 0 ; j < Math.min(products.length, 10); j++) {
              name_rlt[j + len] = products[j];
              price_rlt[j + price_len] = products_price[j];
              products_url[j + url_len] = url[j];
              image_url[j + imageurl_len] = imageurl[j];
            }

            for(let j = 0 ; j < Math.min(products.length, 10); j++) {
              firstNotify_pros[firstNotify_cnt] = products[j];
              firstNotify_pro_url[firstNotify_cnt] = url[j];
              firstNotify_pro_image[firstNotify_cnt] = imageurl[j];
              firstNotify_pro_price[firstNotify_cnt] = products_price[j];
              firstNotify_pro_title[firstNotify_cnt++] = notifyTitle;
            }
          }

          else {
            const L = url.length;
            console.log(url.length);
            let j;
            const pre_url = JSON.parse(preProducts.pro_URL);
            for(j = 0 ; j < L; j++) {
              name_rlt[j + len] = products[j];
              price_rlt[j + price_len] = products_price[j];
              products_url[j + url_len] = url[j];
              image_url[j + imageurl_len] = imageurl[j];

              if(pre_url[0] === url[j] || pre_url[1] === url[j] || pre_url[2] === url[j] ||
                pre_url[3] === url[j]) {
                // for(let k = j + 1 ; k < Math.min(j + 10, L); k++) {
                //   name_rlt[k + len] = products[k];
                //   price_rlt[k + price_len] = products_price[k];
                //   products_url[k + url_len] = url[k];
                //   image_url[k + imageurl_len] = imageurl[k];
                // }
                
                let k;
                for(k = 0 ; k < j; k++) {
                  if(url[k] === preProducts.last_URL || lineToken === "") break;
                  
                  lineNotify(lineToken).notify({
                    message: notifyTitle + "    価格 " + products_price[k] + "円 " + products[k]+ " " + url[k],
                    data: {
                      imageFullsize: imageurl[k].split("?")[0]
                    }
                  }).then(() => {
                    console.log('send completed!');
                  }).catch((error) => {
                    console.log("line error");
                    flag = 1;
                    return ;
                  });
                }
                preProducts.last_URL = url[0];
                await preProducts.save();
                break;
              }
            }

            if(j === L) {
              preProducts.pro_URL = JSON.stringify(url);
              preProducts.last_URL = url[0];
              await preProducts.save();
            }
          }
      }

      else {
        //console.log(pro_URL);
        const pro_URL = JSON.stringify(url);
        const last_URL = url[0];
        console.log(no);
        console.log(user_email);
        console.log(pro_URL);
        console.log(last_URL);

        await YahProduct.create({
          user_email,
          no,
          pro_URL,
          last_URL
        });
        

        for(let j = 0 ; j < Math.min(products.length, 10); j++) {
          name_rlt[j + len] = products[j];
          price_rlt[j + price_len] = products_price[j];
          products_url[j + url_len] = url[j];
          image_url[j + imageurl_len] = imageurl[j];
        }

        for(let j = 0 ; j < Math.min(products.length, 10); j++) {
          firstNotify_pros[firstNotify_cnt] = products[j];
          firstNotify_pro_url[firstNotify_cnt] = url[j];
          firstNotify_pro_image[firstNotify_cnt] = imageurl[j];
          firstNotify_pro_price[firstNotify_cnt] = products_price[j];
          firstNotify_pro_title[firstNotify_cnt++] = notifyTitle;
        }  
      }
    } 
    catch(error) {   
      console.log("error in ");
    }
  }  
 
  // if(req.body.flag === 0 && lineToken !== "") {
  //   for(let i = 0 ; i < firstNotify_cnt; i++) {
  //     lineNotify(lineToken).notify({
  //       message: firstNotify_pro_title[i] + "    価格 " + firstNotify_pro_price[i] + "円 " + firstNotify_pros[i]+ " " + firstNotify_pro_url[i],
  //       data: {
  //         imageFullsize: firstNotify_pro_image[i]
  //       }
  //     }).then(() => {
  //       console.log('send completed!');
  //     }).catch((error) => {
  //       console.log("line error");
  //       flag = 1;
  //       return ;
  //     });
  //   }
  // }
  if(req.body.flag === 0) {
    name_rlt = [];
    price_rlt = [];
    products_url = [];
    image_url = [];
  }
  
  await browser.close();
  console.log("browser closed");
  let sendData = {
    product_names: name_rlt,
    product_prices: price_rlt, 
    product_urls: products_url,
    image_urls: image_url, 
    flag: flag
  };
  
  res.json(sendData);
} catch(error) {
  console.log("error");
}
});


module.exports = router;
