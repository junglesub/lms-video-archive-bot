module.paths.push("/usr/local/lib/node_modules");

require("dotenv").config();
const puppeteer = require("puppeteer");

const axios = require("axios").default;
const https = require("https"); // or 'https' for https:// URLs
const fs = require("fs");

const parser = require("fast-xml-parser");

const classes = require("./classes");

const DATAFILENAME = "data.json";
let fdata = {};

// Logging Setup
var util = require("util");
var log_file = fs.createWriteStream(__dirname + "/log.txt", { flags: "w" });
var error_file = fs.createWriteStream(__dirname + "/error.txt", { flags: "w" });
var log_stdout = process.stdout;

console.log = function (d) {
  //
  log_file.write(util.format([...arguments].join(" ")) + "\n");
  log_stdout.write(util.format([...arguments].join(" ")) + "\n");
};
console.error = function (d) {
  //
  error_file.write(util.format([...arguments].join(" ")) + "\n");
  log_stdout.write(util.format([...arguments].join(" ")) + "\n");
};

// Load Data
if (fs.existsSync(DATAFILENAME)) {
  const rawdata = fs.readFileSync(DATAFILENAME);
  fdata = JSON.parse(rawdata);
} else {
  fdata = {};
}

(async () => {
  const { ID, PW } = process.env;
  // console.log(ID, PW);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // 페이지 이동
    await page.goto("https://online.handong.edu/login");

    // 로그인 할 수 있는 화면 나올때까지 대기.
    await page.waitForSelector("#login_user_id", { visible: true });

    // ID / PW 입력
    await page.$eval("#login_user_id", (el, ID) => (el.value = ID), ID);
    await page.$eval("#login_user_password", (el, PW) => (el.value = PW), PW);

    // 로그인 버튼 클릭
    await page.click(".login_btn");
    await page.waitForResponse("https://online.handong.edu/");

    // 이제부터 LMS 접근 가능. 따라서 해당 페이지는 닫기.
    await page.close();

    // LMS 에서 수업 데이터 가져오기
    // classes.js 에 있는 모든 클라스 정보 가져오기.
    await Promise.all(
      classes.map(
        (c) =>
          new Promise(async (res) => {
            await downloadVideo(browser, c);
            return res();
          })
      )
    );
    await browser.close();
  } catch (e) {
    console.error(e);
  }
})().finally(() => {
  // Save Data
  fs.writeFileSync(DATAFILENAME, JSON.stringify(fdata, null, 2));
});

/**
 *
 * @param {puppeteer.Browser} browser
 * @param {number} classId
 */
const downloadVideo = async (browser, classId) => {
  // 새로운 페이지를 연다.
  const page = await browser.newPage();

  // 강의콘텐츠 페이지로 이동한다.
  await page.goto(
    `https://lms.handong.edu/courses/${classId}/external_tools/2`
  );

  // 네트워크 요청 패킷 분석을 위해 해당 모드를 활성화한다.
  // response 중에 allcomponents_db 데이터가 올때까지 기다린다. (기본 Timeout: 30초)
  const response = await page.waitForResponse(
    (response) =>
      response.url().includes("allcomponents_db") && response.status() === 200
  );

  // response 을 json 으로 변환하여 저장한다.
  const data = await response.json();

  // data 는 배열이다. 따라서 loop 를 준비한다.
  await Promise.all(
    data.map(
      (assignment) =>
        new Promise(async (res, rej) => {
          // 만약 접근이 안되는 것이면 (open = false) 그러면 무시
          if (!assignment.opened || !assignment.commons_content) return res();

          // content 정보를 가져온다
          const { title } = assignment;
          const { content_id, content_type, file_name, view_url } =
            assignment.commons_content;

          console.log("Content => ", content_id, content_type, file_name);

          // 서버에서 데이터 정보 가져오기
          const contenturi = `https://hducc.handong.edu/viewer/ssplayer/uniplayer_support/content.php?content_id=${content_id}`;
          const response = await axios.get(contenturi);
          const jsonObj = parser.parse(response.data);

          // 폴더가 없을 경우 생성하기.
          !fs.existsSync(`./downloads/${classId}`) &&
            fs.mkdirSync(`./downloads/${classId}`, { recursive: true });

          // data
          if (!!fdata[content_id] && fdata[content_id] !== "detected") {
            console.log("Already have " + content_id + " ignoring");
            return res();
          }
          fdata[content_id] = "detected";

          // 만약에 데이터가 pdf 일경우,
          if (content_type === "pdf") {
            const file = fs.createWriteStream(
              `downloads/${classId}/${file_name}`
            );
            try {
              // pdf 를 다운로드 받을 수 있는 직 링크 사용.
              const dlink =
                jsonObj.content.content_playing_info.content_uri +
                "/original.pdf";

              // 로그로 잘 되고 있는지 확인.
              console.log(
                "Downloading pdf",
                content_id,
                content_type,
                file_name,
                dlink
              );

              await new Promise((res, rej) => {
                https.get(dlink, (response) => {
                  if (response.statusCode != 200) throw "Status not 200";
                  response.pipe(file);
                  file.on("finish", function () {
                    console.log("Download Success -", file_name);
                    fdata[content_id] = file.path + " complete";
                    res();
                  });
                });
              });
            } catch (e) {
              console.error("Error while downloading pdf file", content_id);
              fdata[content_id] = "error";
            } finally {
              file.close();
            }
          }
          // 만약 데이터가 movie 일 경우
          else if (content_type === "movie") {
            const file = fs.createWriteStream(
              `downloads/${classId}/${title}.mp4`
            );
            try {
              // pdf 를 다운로드 받을 수 있는 직 링크 사용.
              const dlink =
                jsonObj.content.content_playing_info.main_media.desktop.html5
                  .media_uri;

              // 로그로 잘 되고 있는지 확인.
              console.log(
                "Downloading movie",
                content_id,
                content_type,
                title,
                dlink
              );

              await new Promise((res, rej) => {
                https.get(dlink, (response) => {
                  if (response.statusCode != 200) rej("Status not 200");
                  response.pipe(file);
                  file.on("finish", function () {
                    console.log("Download Success -", title);
                    fdata[content_id] = file.path + " complete";
                    res();
                  });
                });
              });
            } catch (e) {
              console.error("Error while downloading movie file", content_id);
              fdata[content_id] = "error";
            } finally {
              file.close();
            }
          }
          // 데이터가 readystream 일 경우
          else if (content_type === "readystream") {
            // readystream 를 다운로드 받을 수 있는 직 링크 사용.
            let dstory = jsonObj.content.content_playing_info.story_list.story;
            if (!Array.isArray(dstory)) dstory = [dstory];
            await Promise.all(
              dstory.map(
                (st, index) =>
                  new Promise(async (res, rej) => {
                    const file = fs.createWriteStream(
                      `downloads/${classId}/${title}_${index}.mp4`
                    );
                    try {
                      const dlink =
                        jsonObj.content.service_root.media.media_uri[0].replace(
                          "[MEDIA_FILE]",
                          st.main_media_list.main_media
                        );

                      // 로그로 잘 되고 있는지 확인.
                      console.log(
                        "Downloading readystream #" + index,
                        content_id,
                        content_type,
                        title,
                        dlink
                      );
                      await new Promise((res, rej) => {
                        https.get(dlink, (response) => {
                          if (response.statusCode != 200) rej("Status not 200");
                          response.pipe(file);
                          file.on("finish", function () {
                            console.log("Download Success -", title);
                            fdata[content_id] = file.path + " complete";
                            res();
                          });
                        });
                      });
                    } catch (e) {
                      console.error(
                        "Error while downloading readystream file",
                        content_id
                      );
                      fdata[content_id] = "error";
                    } finally {
                      file.close();
                      return res();
                    }
                  })
              )
            );
          }
          // 모르는 데이터 타입일경우.
          else {
            console.log(
              "Unknown type - ",
              content_id,
              content_type,
              classId,
              title
            );
            fdata[content_id] = "unknown";
          }
          return res();
        })
    )
  );
  console.log("All download for", classId, "FINISHED");
  await page.close();
};
