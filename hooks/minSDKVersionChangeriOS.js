const fs = require("fs");
const path = require("path");

const pluginId = "com-outsystems-minsdkversionchanger";

module.exports = function(context) {
    function getPlatformVersion(context) {
        var projectRoot = context.opts.projectRoot;
    
        var packageJsonFile = path.join(
            projectRoot,
            "package.json"
        );
    
        var devDependencies = require(packageJsonFile).devDependencies;
    
        if(devDependencies !== undefined){
            //Probably MABS7
            var platform = devDependencies["cordova-android"];
            if (platform.includes('^')){
                var index = platform.indexOf('^');
                platform = platform.slice(0, index) + platform.slice(index+1);
            }
            if (platform.includes('#')){
                var index = platform.indexOf('#');
                platform = platform.slice(index+1);
            }
            if (platform.includes('+')){
                var index = platform.indexOf('+');
                platform = platform.slice(0,index);
            }
            return platform;
        } else {
            //Probably MABS6.X
            var platformsJsonFile = path.join(
                projectRoot,
                "platforms",
                "platforms.json"
            );
            var platforms = require(platformsJsonFile);
            var platform = context.opts.plugin.platform;
            return platforms[platform];
        }    
    }

    console.log("Started changing ios!")

    const xcode = require("xcode");

    const configPath = path.join("plugins/ios.json"); 
    const configsString = fs.readFileSync(configPath,"utf-8");
    var configs = JSON.parse(configsString);
    configs = configs.installed_plugins[pluginId];

    const ConfigParser = require('cordova-common').ConfigParser;
    const config = new ConfigParser("config.xml");
    const appName = config.name();

    const iosVersionInt = parseInt(configs["IOS_MIN_SDK_VERSION"]);
    const iosVersion = parseInt(configs["IOS_MIN_SDK_VERSION"]).toFixed(1);

    var pbxprojpath = path.join(
        context.opts.projectRoot,
        "platforms",
        "ios",
        appName+".xcodeproj",
        "project.pbxproj"
    );

    var pathpod = path.join(
        context.opts.projectRoot,
        "platforms",
        "ios",
        "Podfile"
    );

    function replacepodfile(match,g1,g2,g3){
        return g1+"platform :ios, '"+iosVersion+"'"+g3
    }

    function replaceConfigXML(match,g1,g2,g3){
        return g1+"name=\"deployment-target\" value=\""+iosVersion+"\""+g3
    }

    function replaceFileRegex(path,regex,replacer){
        
        if(!fs.existsSync(path)){
            console.log(path+ " not found!")
            return;
        }
        var content = fs.readFileSync(path,"utf-8")
        content = content.replace(regex,replacer);
        fs.writeFileSync(path,content);
    }

    var content = fs.readFileSync(pathpod,"utf-8");
    
    var alreadyPodInstalled = content.includes("platform :ios, '"+iosVersion+"'") || content.includes("platform :ios, '"+iosVersionInt+"'")

    content = content.replace(/([\s|\S]*)(platform :ios, '[0-9]+\.[0-9]+')([\S|\s]*)/,replacepodfile);
    fs.writeFileSync(pathpod,content);

    if(!alreadyPodInstalled){
        const child_process = require('child_process');

        var iosPath = path.join(
            context.opts.projectRoot,
            "platforms",
            "ios"
        );

        var output = child_process.exec("pod install",{cwd:iosPath},function(error){
            if(error != null){
                console.log("error :"+error);
            }
        })
        console.log(output.stdout);
    }

    var myproj = xcode.project(pbxprojpath)

    myproj.parse(function (err){

        myproj.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET",iosVersion,"Debug");
        myproj.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET",iosVersion,"Release");

        fs.writeFileSync(pbxprojpath,myproj.writeSync());
    })

    var pathMainConfigXML = path.join(
        context.opts.projectRoot,
        "config.xml"
    );
    var pathAppConfigXML = path.join(
        context.opts.projectRoot,
        "platforms",
        "ios",
        appName,
        "config.xml"
    );
    
    replaceFileRegex(pathMainConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML)
    replaceFileRegex(pathAppConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML)    

    

    console.log("Finished Changing ios!");
};