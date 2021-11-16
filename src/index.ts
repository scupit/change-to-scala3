import fs from "fs";
import path from "path";

function validatedVersion(versionString: string): string {
  const versionRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  if (versionRegex.test(versionString)) {
    return versionString;
  }
  throw EvalError("Invalid scala version string given");
}

function populatePackagePieces(receiverList: string[], gradleBuildFileString: string): void {
  const indexOfAppLine: number = gradleBuildFileString.search(/".+\.(App|main)"/);

  if (indexOfAppLine === -1) {
    throw EvalError("In gradle build file's 'application' section, 'mainClass' is an unexpected value.");
  }

  let lastQuoteIndex = indexOfAppLine + 1;
  while (gradleBuildFileString[lastQuoteIndex] !== '"') {
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
  gradleBuildFilePath: string,
  scalaVersion: string,
  packagePieces: string[]
): string {
  const gradleBuildFileString: string = fs.readFileSync(gradleBuildFilePath).toString();
  populatePackagePieces(packagePieces, gradleBuildFileString);

  return gradleBuildFileString
    .replace(
      /org\.scala-lang:scala-library.*\"/,
      `org.scala-lang:scala3-library_3:${scalaVersion}"`
    )
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

function main() {
  const args: string[] = process.argv.slice(2);

  if (args.length === 2) {
    const gradleBuildFilePath: string = args[0];
    const scalaVersion: string = validatedVersion(args[1]);
    const packagePieces: string[] = [ ];

    writeFixedBuildFile(
      gradleBuildFilePath,
      fixedBuildFileString(gradleBuildFilePath, scalaVersion, packagePieces)
    );

    const mainFilePath: string = makeMainFilePath(gradleBuildFilePath, packagePieces);
    writeModernizedMainFile(mainFilePath, makeModernizedMainFile(mainFilePath));
  }
  else {
    console.log("Must specify exactly one input file and the target Scala version (ie 3.1.0) as arguments.")
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