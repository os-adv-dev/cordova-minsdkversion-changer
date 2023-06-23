const fs = require("fs");
const path = require("path");
const xcode = require("xcode");
const utils = require('./utils');
const Q = require("Q");

const pluginId = "com-outsystems-minsdkversionchanger";

module.exports = function(context) {

    const configPath = path.join("plugins/ios.json"); 
    const configsString = fs.readFileSync(configPath,"utf-8");
    const configs = JSON.parse(configsString).installed_plugins[pluginId];
    const iosVersion = parseInt(configs["IOS_MIN_SDK_VERSION"]).toFixed(1);
    const ConfigParser = require('cordova-common').ConfigParser;
    const config = new ConfigParser("config.xml"); 
    const appName = config.name();
    //var Q = context.requireCordovaModule('q');

    var modifyPbxProj = function(){
        var deferral = new Q.defer();

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

            fs.writeFile(pbxprojpath,pbxProject.writeSync(), function(err){
                if (err) {
                    deferral.reject();
                    throw new Error('Unable to write to Podfile: ' + err);
                }
                deferral.resolve();
            });
        })
        return deferral.promise;
    }

    var modifyPodFile = function(){
        var deferral = new Q.defer();
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
    
        const updatedByString = "#UPDATED BY MINSDKVERSIONCHANGERPLUGIN";
    
        var postInstallScript = `
    installer.pods_project.targets.each do |target|
        target.build_configurations.each do |config|
            #sets all pod projects with deployment_target = 12.0
            config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "12.0"
        end
    end`;

        fs.readFile(podfilePath, 'utf8', function (err, content) {
            if (err) {
              throw new Error('Unable to find Podfile: ' + err);
            }

            const podAlreadyInstalled = content.includes(updatedByString);

            if(podAlreadyInstalled){
                deferral.resolve();
            }
            
            //updates platform :ios, 'xx.x' to the needed version
            content = content.replace(/([\s|\S]*)(platform :ios, '[0-9]+\.[0-9]+')([\S|\s]*)/,replacepodfile);

            //handles post_install 
            var postInstallRegex = /post_install do \|installer\|[^]+end/m;
            var postInstallMatch = content.match(postInstallRegex);
        
            if (postInstallMatch) {
                // If post_install already exists, update it by replacing the script
                var updatedContents = content.replace(postInstallRegex, function (match) {
                    return match.replace(/end/, '') + "\n" + postInstallScript.trim() + '\nend';
                });

                try {
                    fs.writeFileSync(podfilePath, updatedByString + "\n" + updatedContents, 'utf8');
                } catch (err){
                    throw new Error('Unable to write to Podfile: ' + err);
                }
            } else {
                // If post_install doesn't exist, add it to the Podfile
                var newContents = content.trim() + '\n\npost_install do |installer|\n' + postInstallScript.trim() + '\nend\n';

                try {
                    fs.writeFileSync(podfilePath, updatedByString + "\n" + newContents, 'utf8')
                } catch(err){
                    throw new Error('Unable to write to Podfile: ' + err);
                }
            }

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
                deferral.resolve();
            })
        });
        return deferral.promise;
    }

    var modifyConfigXml = function(){
        var deferral1 = new Q.defer();
        var deferral2 = new Q.defer();
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

        utils.replaceFileRegex(pathMainConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML, function(err){
            if (err) {
                deferral1.reject();
                throw new Error('Unable to write to configXml: ' + err);
            }
            deferral1.resolve();
        })
        utils.replaceFileRegex(pathAppConfigXML,/([\s|\S]*)(name=\"deployment-target\" value=\"[0-9]+\.[0-9]+\")([\S|\s]*)/,replaceConfigXML, function(err){
            if (err) {
                deferral2.reject();
                throw new Error('Unable to write to configXml: ' + err);
            }
            deferral2.resolve();
        })
        return Promise.all([deferral1.promise, deferral2.promise]);
    }

    console.log("Started updating ios to support a lower sdk version!")

    const p1 = modifyPbxProj();
    const p2 = modifyPodFile();
    const p3 = modifyConfigXml();

    return Promise.all([p1, p2, p3]).then(function(){
        console.log("Ended updating ios to support a lower sdk version!");
    })
};
