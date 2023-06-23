const fs = require("fs");

module.exports = {
    replaceFileRegex: function (path,regex,replacer, callback){
        
        if(!fs.existsSync(path)){
            console.log(path+ " not found!")
            return;
        }
        var content = fs.readFileSync(path,"utf-8")
        content = content.replace(regex,replacer);
        fs.writeFile(path,content,callback);
    }
}