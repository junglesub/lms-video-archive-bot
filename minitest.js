const axios = require("axios").default;
var parser = require("fast-xml-parser");

(async () => {
  const response = await axios.get(
    "https://hducc.handong.edu/viewer/ssplayer/uniplayer_support/content.php?content_id=[classID]"
  );
  console.log(response.data);
  var jsonObj = parser.parse(response.data);
  // console.log(
  //   jsonObj.content.content_playing_info.story_list.story.map((st) =>
  //     jsonObj.content.service_root.media.media_uri[0].replace(
  //       "[MEDIA_FILE]",
  //       st.main_media_list.main_media
  //     )
  //   )
  // );
  console.log(jsonObj.content.content_playing_info.story_list.story);
  console.log(jsonObj.content.service_root.media.media_uri[0]);
  // console.log(
  //   jsonObj.content.content_playing_info.content_uri + "/original.pdf"
  // );
})();
