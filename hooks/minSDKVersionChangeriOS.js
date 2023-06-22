const fs = require("fs");
const path = require("path");
const xcode = require("xcode");

const utils = require('./utils');

const pluginId = "com-outsystems-minsdkversionchanger";

module.exports = function(context) {

    const configPath = path.join("plugins/ios.json"); 
    const configsString = fs.readFileSync(configPath,"utf-8");
    const configs = JSON.parse(configsString).installed_plugins[pluginId];
    const iosVersion = parseInt(configs["IOS_MIN_SDK_VERSION"]).toFixed(1);
    const ConfigParser = require('cordova-common').ConfigParser;
    const config = new ConfigParser("config.xml"); 
    const appName = config.name();

    var modifyPbxProj = function(){

        const pbxprojpath = path.join(
            context.opts.projectRoot,
            "platforms",
            "ios",
            appName+".xcodeproj",
            "project.pbxproj"
        );

        const pbxProject = xcode.project(pbxprojpath)

        pbxProject.parse(function (err){

            pbxProject.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET",iosVersion,"Debug");
            pbxProject.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET",iosVersion,"Release");

            fs.writeFileSync(pbxprojpath,pbxProject.writeSync());
        })
    }

    var modifyPodFile = function(){
        const iosVersionInt = parseInt(configs["IOS_MIN_SDK_VERSION"]);
        const podfilePath = path.join(
            context.opts.projectRoot,
            "platforms",
            "ios",
            "Podfile"
        );
    
        function replacepodfile(match,g1,g2,g3){
            return g1+"platform :ios, '"+iosVersion+"'"+g3
        }
    
        var content = fs.readFileSync(podfilePath,"utf-8");
    
        content = content.replace(/([\s|\S]*)(platform :ios, '[0-9]+\.[0-9]+')([\S|\s]*)/,replacepodfile);

        var postInstallScript = `
    installer.pods_project.targets.each do |target|
        target.build_configurations.each do |config|
            #sets all pod projects with deployment_target = 12.0
            config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "12.0"
        end
    end`;

        fs.readFile(podfilePath, 'utf8', function (err, data) {
            if (err) {
              throw new Error('Unable to find Podfile: ' + err);
            }

            var postInstallRegex = /post_install do \|installer\|[^]+end/m;
            var postInstallMatch = data.match(postInstallRegex);
        
            if (postInstallMatch) {
                // If post_install already exists, update it by replacing the script
                var updatedContents = data.replace(postInstallRegex, function (match) {
                    return match.replace(/end/, '') + "\n" + postInstallScript.trim() + '\nend';
                });
            
                fs.writeFile(podfilePath, updatedContents, 'utf8', function (err) {
                    if (err) {
                    throw new Error('Unable to write to Podfile: ' + err);
                    }
                });
            } else {
                // If post_install doesn't exist, add it to the Podfile
                var newContents = data.trim() + '\n\npost_install do |installer|\n' + postInstallScript.trim() + '\nend\n';
            
                fs.writeFile(podfilePath, newContents, 'utf8', function (err) {
                    if (err) {
                    throw new Error('Unable to write to Podfile: ' + err);
                    }
                });
            }
        });

        /*content+= "post_install do |installer|\n\
                    installer.pods_project.targets.each do |target|\n\
                        target.build_configurations.each do |config|\n\
                            //sets all pod projects with deployment_target = 12.0\n\
                            config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'\n\
                        end\n\
                    end\n\
                end";*/
        const alreadyPodInstalled = content.includes("platform :ios, '"+iosVersion+"'") || content.includes("platform :ios, '"+iosVersionInt+"'")
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
    }

    console.log("Started updating ios to support a lower sdk version!")

    var modifyConfigXml = function(){
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
        var replaceConfigXML = function(match,g1,g2,g3){
            return g1+"name=\"deployment-target\" value=\""+iosVersion+"\""+g3
        }

        utils.replaceFileRegex(pathMainConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML)
        utils.replaceFileRegex(pathAppConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML)
    }

    modifyPbxProj();
    modifyPodFile();
    modifyConfigXml();

    console.log("Finished Changing ios!");
};
