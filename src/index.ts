import fs from "fs";
import path from "path";

interface BuildFileData {
  filePath: string;
  isLibrary: boolean;
}

function validatedVersion(versionString: string): string {
  const versionRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  if (versionRegex.test(versionString)) {
    return versionString;
  }
  throw EvalError("Invalid scala version string given");
}

function populatePackagePieces(receiverList: string[], gradleBuildFileString: string): void {
  const indexOfAppLine: number = gradleBuildFileString.search(/("|').+\.(App|main)("|')/);

  if (indexOfAppLine === -1) {
    throw EvalError("In gradle build file's 'application' section, 'mainClass' is an unexpected value.");
  }

  let lastQuoteIndex = indexOfAppLine + 1;
  while (gradleBuildFileString[lastQuoteIndex] !== '"' && gradleBuildFileString[lastQuoteIndex] !== "'") {
    ++lastQuoteIndex;
  }

  const pieces: string[] = gradleBuildFileString
    .substring(
      indexOfAppLine + 1,
      lastQuoteIndex
    )
    .split(".");

  // remove the 'App' or 'main' since it isn't part of the package or file path.
  pieces.pop();

  for (const piece of pieces) {
    receiverList.push(piece);
  }
}

function fixedBuildFileString(
  gradleBuildFileData: BuildFileData,
  scalaVersion: string,
  packagePieces: string[]
): string {
  const gradleBuildFileString: string = fs.readFileSync(gradleBuildFileData.filePath).toString();

  if (!gradleBuildFileData.isLibrary) {
    populatePackagePieces(packagePieces, gradleBuildFileString);
  }

  const updatedString = gradleBuildFileString
    .replace(
      /Use Scala .+ /,
      `Use Scala ${scalaVersion} `
    )
    .replace(
      /('|")org\.scala-lang:scala-library.*('|")/,
      `"org.scala-lang:scala3-library_3:${scalaVersion}"`
    );

    if (gradleBuildFileData.isLibrary) {
      return updatedString;
    }

    return updatedString
      .replace(
        /\.App/,
        ".main"
      );
}

function writeFixedBuildFile(gradleBuildFilePath: string, newData: string): void {
  fs.writeFileSync(gradleBuildFilePath, newData);
}

function makeMainFilePath(gradleBuildFilePath: string, packagePieces: string[]): string {
  return path.resolve(
    path.dirname(gradleBuildFilePath),
    "src",
    "main",
    "scala",
    ...packagePieces,
    "App.scala"
  );
}

function makeModernizedMainFile(mainFilePath: string): string {
  const first4Lines: string = fs.readFileSync(mainFilePath)
    .toString()
    .replaceAll("\r", "")
    .split("\n")
    .slice(0, 5)
    .join("\n");

  return `${first4Lines}\n@main def main() =\n\tprintln("Hello World!")\n`;
}

function writeModernizedMainFile(mainFilePath: string, newMainFileData: string): void {
  fs.writeFile(mainFilePath, newMainFileData, (err) => {
    if (err) throw err;
  })
}

function getBuildFilePath(projectRoot: string): BuildFileData | null {
  const gradleBuildFileNames = [
    "build.gradle.kts",
    "build.gradle"
  ];

  const exeBuildFile = gradleBuildFileNames
    .map(fileName => path.resolve(projectRoot, "app", fileName))
    .find(gradleBuildFile => fs.existsSync(gradleBuildFile));

  if (exeBuildFile) {
    return {
      filePath: exeBuildFile,
      isLibrary: false
    }
  }

  const libBuildFile = gradleBuildFileNames
    .map(fileName => path.resolve(projectRoot, "lib", fileName))
    .find(gradleBuildFile => fs.existsSync(gradleBuildFile));

  if (libBuildFile) {
    return {
      filePath: libBuildFile,
      isLibrary: true
    }
  }

  return null;
}

function main() {
  const args: string[] = process.argv.slice(2);

  if (args.length === 2) {
    const gradleBuildFileData: BuildFileData | null = getBuildFilePath(args[0]);

    if (gradleBuildFileData === null) {
      throw EvalError(`Unable to find Gradle build file using project root ${args[0]}`)
    }

    const scalaVersion: string = validatedVersion(args[1]);
    const packagePieces: string[] = [ ];

    writeFixedBuildFile(
      gradleBuildFileData.filePath,
      fixedBuildFileString(gradleBuildFileData, scalaVersion, packagePieces)
    );

    if (!gradleBuildFileData.isLibrary) {
      const mainFilePath: string = makeMainFilePath(gradleBuildFileData.filePath, packagePieces);
      writeModernizedMainFile(mainFilePath, makeModernizedMainFile(mainFilePath));
    }
  }
  else {
    console.warn("Must specify exactly one project root and the target Scala version (ie 3.1.0) as arguments.")
  }
}

try {
  main()
}
catch (err) {
  if (err instanceof EvalError) {
    console.error(err.message);
  }
  else throw err;
}